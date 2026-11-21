<?php
/**
 * Bootstrap: options, hooks, cron.
 *
 * Form settings (widget, knowledge, sync preferences) live in podai_chat_settings and are sanitized
 * through the Settings API. Connection credentials and sync status live in a separate option,
 * podai_chat_connection, so the settings form cannot overwrite them.
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Main plugin class.
 */
final class PodAI_Chat_Plugin {

	const OPTION     = 'podai_chat_settings';
	const CONNECTION = 'podai_chat_connection';
	const CRON       = 'podai_chat_full_sync';
	const CRON_ONE   = 'podai_chat_sync_batch';

	/**
	 * Singleton.
	 *
	 * @var PodAI_Chat_Plugin|null
	 */
	private static $instance = null;

	/**
	 * Get the instance.
	 *
	 * @return PodAI_Chat_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Hooks.
	 */
	private function __construct() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action( 'admin_notices', array( $this, 'notice_no_woocommerce' ) );
			return;
		}
		PodAI_Chat_REST::init();
		PodAI_Chat_Sync::init();
		PodAI_Chat_Widget::init();
		PodAI_Chat_Agent::init();
		if ( is_admin() ) {
			PodAI_Chat_Admin::init();
			PodAI_Chat_Assistant::init();
		}
		add_action( self::CRON, array( 'PodAI_Chat_Sync', 'full_sync' ) );
		add_action( self::CRON_ONE, array( 'PodAI_Chat_Sync', 'full_sync' ) );
	}

	/**
	 * Notice when WooCommerce is missing.
	 */
	public function notice_no_woocommerce() {
		echo '<div class="notice notice-error"><p>' . esc_html__( 'Pod.AI Chat needs WooCommerce to be installed and active.', 'pod-ai-chat-for-woocommerce' ) . '</p></div>';
	}

	/**
	 * Keys stored in the connection option (never accepted from the settings form).
	 *
	 * @return string[]
	 */
	public static function connection_keys() {
		return array( 'backend', 'site_id', 'secret', 'last_sync', 'last_sync_info' );
	}

	/**
	 * Default form settings.
	 *
	 * @return array
	 */
	public static function form_defaults() {
		return array(
			'enabled'        => 1,
			'ticket_email'   => '',
			'color'          => '#2b2520',
			'position'       => 'right',
			'language'       => 'auto',
			'title'          => '',
			'greeting'       => '',
			'shipping_page'  => 0,
			'contact_page'   => 0,
			'promo_code'     => '',
			'promo_summary'  => '',
			'faq'            => '',
			'reply_hours'    => 24,
			'agent_api'      => 1,
			'sync_sku_stock' => 0,
		);
	}

	/**
	 * Default connection values.
	 *
	 * @return array
	 */
	public static function connection_defaults() {
		return array(
			'backend'        => PODAI_CHAT_BACKEND,
			'site_id'        => '',
			'secret'         => '',
			'last_sync'      => '',
			'last_sync_info' => '',
		);
	}

	/**
	 * Default settings (form + connection), for callers that expect one array.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array_merge( self::connection_defaults(), self::form_defaults() );
	}

	/**
	 * Move credentials out of the settings option (installs from 1.2.1 and earlier).
	 */
	private static function migrate_connection() {
		static $done = false;
		if ( $done ) {
			return;
		}
		$done = true;
		if ( false !== get_option( self::CONNECTION, false ) ) {
			return;
		}
		$saved = get_option( self::OPTION, array() );
		if ( ! is_array( $saved ) ) {
			$saved = array();
		}
		$has = ! empty( $saved['site_id'] ) || ! empty( $saved['secret'] ) || ! empty( $saved['last_sync'] );
		if ( ! $has && empty( $saved['backend'] ) ) {
			return;
		}
		$moved = array();
		foreach ( self::connection_keys() as $k ) {
			if ( isset( $saved[ $k ] ) ) {
				$moved[ $k ] = $saved[ $k ];
			}
		}
		add_option( self::CONNECTION, wp_parse_args( $moved, self::connection_defaults() ), '', false );
		foreach ( self::connection_keys() as $k ) {
			unset( $saved[ $k ] );
		}
		self::write_form_option( $saved );
	}

	/**
	 * Write the settings option, bypassing the Settings API allowlist used for form posts.
	 *
	 * @param array $value Form settings only.
	 */
	public static function write_form_option( array $value ) {
		if ( class_exists( 'PodAI_Chat_Admin' ) ) {
			PodAI_Chat_Admin::$trusted_update = true;
		}
		update_option( self::OPTION, $value, false );
		if ( class_exists( 'PodAI_Chat_Admin' ) ) {
			PodAI_Chat_Admin::$trusted_update = false;
		}
	}

	/**
	 * Form settings merged with defaults (no connection fields).
	 *
	 * @return array
	 */
	public static function form_settings() {
		self::migrate_connection();
		$saved = get_option( self::OPTION, array() );
		if ( ! is_array( $saved ) ) {
			$saved = array();
		}
		foreach ( self::connection_keys() as $k ) {
			unset( $saved[ $k ] );
		}
		return wp_parse_args( $saved, self::form_defaults() );
	}

	/**
	 * Connection option merged with defaults.
	 *
	 * @return array
	 */
	public static function connection() {
		self::migrate_connection();
		$saved = get_option( self::CONNECTION, array() );
		return wp_parse_args( is_array( $saved ) ? $saved : array(), self::connection_defaults() );
	}

	/**
	 * Settings merged with defaults (form + connection).
	 *
	 * @return array
	 */
	public static function settings() {
		return array_merge( self::connection(), self::form_settings() );
	}

	/**
	 * Update some settings. Connection keys are written to the connection option.
	 *
	 * @param array $patch Values.
	 */
	public static function update( array $patch ) {
		$conn_patch = array_intersect_key( $patch, array_flip( self::connection_keys() ) );
		$form_patch = array_diff_key( $patch, $conn_patch );
		if ( $conn_patch ) {
			update_option( self::CONNECTION, array_merge( self::connection(), $conn_patch ), false );
		}
		if ( $form_patch ) {
			self::write_form_option( array_merge( self::form_settings(), $form_patch ) );
		}
	}

	/**
	 * Connected to the Pod.AI backend?
	 *
	 * @return bool
	 */
	public static function connected() {
		$c = self::connection();
		return ! empty( $c['site_id'] ) && ! empty( $c['secret'] );
	}

	/**
	 * Activation: schedule the daily full sync.
	 */
	public static function activate() {
		if ( ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + 300, 'daily', self::CRON );
		}
		if ( false === get_option( self::OPTION, false ) ) {
			add_option( self::OPTION, self::form_defaults(), '', false );
		}
	}

	/**
	 * Deactivation: stop cron jobs (settings and connection are kept; uninstall removes them).
	 */
	public static function deactivate() {
		wp_clear_scheduled_hook( self::CRON );
		wp_clear_scheduled_hook( self::CRON_ONE );
	}
}
