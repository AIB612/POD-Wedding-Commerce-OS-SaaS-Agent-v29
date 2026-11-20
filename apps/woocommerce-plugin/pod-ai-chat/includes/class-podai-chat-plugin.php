<?php
/**
 * Bootstrap: options, hooks, cron.
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Main plugin class.
 */
final class PodAI_Chat_Plugin {

	const OPTION   = 'podai_chat_settings';
	const CRON     = 'podai_chat_full_sync';
	const CRON_ONE = 'podai_chat_sync_batch';

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
		add_action( 'init', array( $this, 'load_textdomain' ) );
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
	 * Translations (en, de, fr, it, zh_CN in /languages).
	 */
	public function load_textdomain() {
		// Needed while the plugin ships its own translations (not hosted on WordPress.org).
		load_plugin_textdomain( 'pod-ai-chat', false, dirname( plugin_basename( PODAI_CHAT_FILE ) ) . '/languages' ); // phpcs:ignore PluginCheck.CodeAnalysis.DiscouragedFunctions.load_plugin_textdomainFound
	}

	/**
	 * Notice when WooCommerce is missing.
	 */
	public function notice_no_woocommerce() {
		echo '<div class="notice notice-error"><p>' . esc_html__( 'Pod.AI Chat needs WooCommerce to be installed and active.', 'pod-ai-chat' ) . '</p></div>';
	}

	/**
	 * Default settings.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'backend'        => PODAI_CHAT_BACKEND,
			'site_id'        => '',
			'secret'         => '',
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
			'last_sync'      => '',
			'last_sync_info' => '',
		);
	}

	/**
	 * Settings merged with defaults.
	 *
	 * @return array
	 */
	public static function settings() {
		$saved = get_option( self::OPTION, array() );
		return wp_parse_args( is_array( $saved ) ? $saved : array(), self::defaults() );
	}

	/**
	 * Update some settings.
	 *
	 * @param array $patch Values.
	 */
	public static function update( array $patch ) {
		update_option( self::OPTION, array_merge( self::settings(), $patch ), false );
	}

	/**
	 * Connected to the Pod.AI backend?
	 *
	 * @return bool
	 */
	public static function connected() {
		$s = self::settings();
		return ! empty( $s['site_id'] ) && ! empty( $s['secret'] );
	}

	/**
	 * Activation: schedule the daily full sync.
	 */
	public static function activate() {
		if ( ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + 300, 'daily', self::CRON );
		}
		if ( false === get_option( self::OPTION, false ) ) {
			add_option( self::OPTION, self::defaults(), '', false );
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
