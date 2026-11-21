<?php
/**
 * WP admin: Pod.AI menu with Settings (connect, widget, ticket e-mail, knowledge, sync, plan) and Tickets.
 * The Assistant page lives in class-podai-chat-assistant.php.
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Admin pages.
 */
class PodAI_Chat_Admin {

	const CAP = 'manage_woocommerce';

	/**
	 * When true, sanitize() accepts a trusted internal write (never set from request data).
	 *
	 * @var bool
	 */
	public static $trusted_update = false;

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_action( 'admin_post_podai_chat_connect', array( __CLASS__, 'connect' ) );
		add_action( 'admin_post_podai_chat_disconnect', array( __CLASS__, 'disconnect' ) );
		add_action( 'admin_post_podai_chat_sync', array( __CLASS__, 'sync' ) );
		add_action( 'admin_post_podai_chat_ticket', array( __CLASS__, 'ticket_update' ) );
		add_action( 'admin_post_podai_chat_upgrade', array( __CLASS__, 'upgrade' ) );
		add_action( 'admin_post_podai_chat_portal', array( __CLASS__, 'portal' ) );
		add_action( 'update_option_' . PodAI_Chat_Plugin::OPTION, array( __CLASS__, 'after_save' ), 10, 0 );
		add_filter( 'plugin_action_links_' . plugin_basename( PODAI_CHAT_FILE ), array( __CLASS__, 'links' ) );
	}

	/**
	 * Settings link on the plugins screen.
	 *
	 * @param array $links Links.
	 * @return array
	 */
	public static function links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=pod-ai-chat' ) ) . '">' . esc_html__( 'Settings', 'pod-ai-chat-for-woocommerce' ) . '</a>' );
		return $links;
	}

	/**
	 * Menu.
	 */
	public static function menu() {
		$icon = 'data:image/svg+xml;base64,' . base64_encode( '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#a7aaad" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		add_menu_page( __( 'Pod.AI Chat', 'pod-ai-chat-for-woocommerce' ), __( 'Pod.AI Chat', 'pod-ai-chat-for-woocommerce' ), self::CAP, 'pod-ai-chat', array( __CLASS__, 'page_settings' ), $icon, 56 );
		add_submenu_page( 'pod-ai-chat', __( 'Settings', 'pod-ai-chat-for-woocommerce' ), __( 'Settings', 'pod-ai-chat-for-woocommerce' ), self::CAP, 'pod-ai-chat', array( __CLASS__, 'page_settings' ) );
		add_submenu_page( 'pod-ai-chat', __( 'Tickets', 'pod-ai-chat-for-woocommerce' ), __( 'Tickets', 'pod-ai-chat-for-woocommerce' ), self::CAP, 'pod-ai-chat-tickets', array( __CLASS__, 'page_tickets' ) );
	}

	/**
	 * Settings API.
	 */
	public static function register_settings() {
		register_setting(
			'podai_chat',
			PodAI_Chat_Plugin::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
				'show_in_rest'      => false,
			)
		);
	}

	/**
	 * Enqueue admin CSS/JS on plugin screens only.
	 *
	 * @param string $hook Admin page hook.
	 */
	public static function enqueue( $hook ) {
		if ( false === strpos( (string) $hook, 'pod-ai-chat' ) ) {
			return;
		}
		wp_register_style( 'podai-chat-admin', PODAI_CHAT_URL . 'assets/css/admin.css', array(), PODAI_CHAT_VERSION );
		wp_enqueue_style( 'podai-chat-admin' );
		wp_register_script( 'podai-chat-admin', PODAI_CHAT_URL . 'assets/js/admin.js', array(), PODAI_CHAT_VERSION, true );
		wp_enqueue_script( 'podai-chat-admin' );
	}

	/**
	 * Sanitize settings form fields. Connection fields are never accepted here,
	 * regardless of any form marker. Internal writes use Plugin::update() / write_form_option().
	 *
	 * @param mixed $in Input.
	 * @return array
	 */
	public static function sanitize( $in ) {
		if ( self::$trusted_update ) {
			return is_array( $in ) ? $in : array();
		}
		$in    = is_array( $in ) ? $in : array();
		$color = sanitize_hex_color( isset( $in['color'] ) ? $in['color'] : '' );
		$code  = strtoupper( preg_replace( '/[^A-Za-z0-9_-]/', '', isset( $in['promo_code'] ) ? $in['promo_code'] : '' ) );
		return array(
			'enabled'        => empty( $in['enabled'] ) ? 0 : 1,
			'ticket_email'   => sanitize_email( isset( $in['ticket_email'] ) ? $in['ticket_email'] : '' ),
			'color'          => $color ? $color : '#2b2520',
			'position'       => isset( $in['position'] ) && 'left' === $in['position'] ? 'left' : 'right',
			'language'       => isset( $in['language'] ) && in_array( $in['language'], array( 'auto', 'en', 'de', 'fr', 'it', 'zh' ), true ) ? $in['language'] : 'auto',
			'title'          => sanitize_text_field( isset( $in['title'] ) ? $in['title'] : '' ),
			'greeting'       => sanitize_text_field( isset( $in['greeting'] ) ? $in['greeting'] : '' ),
			'shipping_page'  => absint( isset( $in['shipping_page'] ) ? $in['shipping_page'] : 0 ),
			'contact_page'   => absint( isset( $in['contact_page'] ) ? $in['contact_page'] : 0 ),
			'promo_code'     => substr( $code, 0, 40 ),
			'promo_summary'  => sanitize_text_field( isset( $in['promo_summary'] ) ? $in['promo_summary'] : '' ),
			'faq'            => sanitize_textarea_field( isset( $in['faq'] ) ? $in['faq'] : '' ),
			'reply_hours'    => max( 1, min( 168, absint( isset( $in['reply_hours'] ) ? $in['reply_hours'] : 24 ) ) ),
			'agent_api'      => empty( $in['agent_api'] ) ? 0 : 1,
			'sync_sku_stock' => empty( $in['sync_sku_stock'] ) ? 0 : 1,
		);
	}

	/**
	 * After saving: push store facts + settings to the backend.
	 */
	public static function after_save() {
		static $done = false;
		if ( $done || ! PodAI_Chat_Plugin::connected() || ! isset( $_POST['option_page'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- options.php already checked the nonce.
			return;
		}
		$done = true;
		delete_transient( 'podai_chat_config' );
		$res = PodAI_Chat_Store::push();
		if ( is_wp_error( $res ) ) {
			add_settings_error( 'podai_chat', 'push', __( 'Saved, but Pod.AI could not be updated:', 'pod-ai-chat-for-woocommerce' ) . ' ' . $res->get_error_message() );
		}
	}

	/**
	 * Check capability + nonce.
	 *
	 * @param string $action Action.
	 */
	private static function guard( $action ) {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'pod-ai-chat-for-woocommerce' ) );
		}
		check_admin_referer( $action );
	}

	/**
	 * Redirect back with a notice.
	 *
	 * @param string $page Page slug.
	 * @param string $code Notice code.
	 * @param array  $args Extra args.
	 */
	private static function back( $page, $code, $args = array() ) {
		wp_safe_redirect( add_query_arg( array_merge( array( 'page' => $page, 'podai_notice' => $code ), $args ), admin_url( 'admin.php' ) ) );
		exit;
	}

	/**
	 * Connect: register with the backend, store site key + secret, push facts, first full sync.
	 */
	public static function connect() {
		self::guard( 'podai_chat_connect' );
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce verified in self::guard().
		$backend = isset( $_POST['backend'] ) ? esc_url_raw( wp_unslash( $_POST['backend'] ) ) : PODAI_CHAT_BACKEND;
		if ( ! $backend ) {
			$backend = PODAI_CHAT_BACKEND;
		}
		$res = PodAI_Chat_Client::register( $backend );
		if ( is_wp_error( $res ) || empty( $res['site_id'] ) || empty( $res['secret'] ) ) {
			self::back( 'pod-ai-chat', 'connect_failed', array( 'podai_err' => is_wp_error( $res ) ? $res->get_error_message() : 'invalid_response' ) );
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce verified in self::guard().
		$sync_sku_stock = empty( $_POST['sync_sku_stock'] ) ? 0 : 1;
		PodAI_Chat_Plugin::update(
			array(
				'backend'        => untrailingslashit( $backend ),
				'site_id'        => sanitize_text_field( $res['site_id'] ),
				'secret'         => sanitize_text_field( $res['secret'] ),
				'sync_sku_stock' => $sync_sku_stock,
			)
		);
		PodAI_Chat_Sync::full_sync();
		self::back( 'pod-ai-chat', 'connected' );
	}

	/**
	 * Disconnect: delete this site's data at Pod.AI, forget the key.
	 */
	public static function disconnect() {
		self::guard( 'podai_chat_disconnect' );
		PodAI_Chat_Client::request( 'POST', 'disconnect', array() );
		PodAI_Chat_Plugin::update(
			array(
				'site_id'   => '',
				'secret'    => '',
				'last_sync' => '',
			)
		);
		delete_transient( 'podai_chat_config' );
		self::back( 'pod-ai-chat', 'disconnected' );
	}

	/**
	 * Sync now.
	 */
	public static function sync() {
		self::guard( 'podai_chat_sync' );
		$res = PodAI_Chat_Sync::full_sync();
		self::back( 'pod-ai-chat', is_wp_error( $res ) ? 'sync_failed' : 'synced', is_wp_error( $res ) ? array( 'podai_err' => $res->get_error_message() ) : array( 'podai_n' => (int) $res['sent'] ) );
	}

	/**
	 * Upgrade: ask Pod.AI for a Paddle checkout of the chosen plan and open it.
	 */
	public static function upgrade() {
		self::guard( 'podai_chat_upgrade' );
		// phpcs:disable WordPress.Security.NonceVerification.Missing -- nonce verified in self::guard().
		$plan  = isset( $_POST['plan'] ) ? sanitize_key( wp_unslash( $_POST['plan'] ) ) : '';
		$cycle = isset( $_POST['cycle'] ) && 'annual' === $_POST['cycle'] ? 'annual' : 'monthly';
		// phpcs:enable WordPress.Security.NonceVerification.Missing
		$res = PodAI_Chat_Client::request(
			'POST',
			'billing/checkout',
			array(
				'plan'       => $plan,
				'cycle'      => $cycle,
				'email'      => wp_get_current_user()->user_email,
				'return_url' => admin_url( 'admin.php?page=pod-ai-chat&podai_notice=billing_return' ),
			)
		);
		self::open_billing( $res );
	}

	/**
	 * Manage billing: Paddle customer portal.
	 */
	public static function portal() {
		self::guard( 'podai_chat_portal' );
		self::open_billing( PodAI_Chat_Client::request( 'POST', 'billing/portal', array() ) );
	}

	/**
	 * Redirect to a billing URL returned by the backend (Pod.AI checkout page or Paddle portal only).
	 *
	 * @param array|WP_Error $res Backend response.
	 */
	private static function open_billing( $res ) {
		$url  = ! is_wp_error( $res ) && ! empty( $res['url'] ) ? esc_url_raw( $res['url'] ) : '';
		$host = $url ? wp_parse_url( $url, PHP_URL_HOST ) : '';
		$own  = wp_parse_url( PodAI_Chat_Plugin::settings()['backend'], PHP_URL_HOST );
		if ( ! $url || ! ( $host === $own || preg_match( '/(^|\.)paddle\.com$/', (string) $host ) ) ) {
			self::back( 'pod-ai-chat', 'billing_failed', array( 'podai_err' => rawurlencode( is_wp_error( $res ) ? $res->get_error_message() : 'billing_unavailable' ) ) );
		}
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- external billing page, host checked above.
		exit;
	}

	/**
	 * Ticket status / note.
	 */
	public static function ticket_update() {
		self::guard( 'podai_chat_ticket' );
		// phpcs:disable WordPress.Security.NonceVerification.Missing -- nonce verified in self::guard().
		$id     = isset( $_POST['ticket'] ) ? sanitize_key( wp_unslash( $_POST['ticket'] ) ) : '';
		$status = isset( $_POST['status'] ) ? sanitize_key( wp_unslash( $_POST['status'] ) ) : '';
		$note   = isset( $_POST['note'] ) ? sanitize_textarea_field( wp_unslash( $_POST['note'] ) ) : '';
		// phpcs:enable WordPress.Security.NonceVerification.Missing
		$body   = array();
		if ( in_array( $status, array( 'open', 'pending', 'closed' ), true ) ) {
			$body['status'] = $status;
		}
		if ( '' !== $note ) {
			$body['add_note'] = $note;
		}
		$res = PodAI_Chat_Client::request( 'POST', 'tickets/' . rawurlencode( $id ), $body );
		self::back( 'pod-ai-chat-tickets', is_wp_error( $res ) ? 'ticket_failed' : 'ticket_saved', array( 'ticket' => $id ) );
	}

	/**
	 * Notices from redirects.
	 */
	private static function notices() {
		$code = isset( $_GET['podai_notice'] ) ? sanitize_key( wp_unslash( $_GET['podai_notice'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$err  = isset( $_GET['podai_err'] ) ? sanitize_text_field( wp_unslash( $_GET['podai_err'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$map  = array(
			'connected'      => array( 'success', __( 'Connected to Pod.AI. Your products were synced and the chat is live on your store.', 'pod-ai-chat-for-woocommerce' ) ),
			'connect_failed' => array( 'error', __( 'Could not connect to Pod.AI:', 'pod-ai-chat-for-woocommerce' ) . ' ' . $err ),
			'disconnected'   => array( 'success', __( 'Disconnected. Your store data at Pod.AI was deleted.', 'pod-ai-chat-for-woocommerce' ) ),
			/* translators: %d: number of products. */
			'synced'         => array( 'success', sprintf( __( 'Sync finished: %d products sent.', 'pod-ai-chat-for-woocommerce' ), isset( $_GET['podai_n'] ) ? absint( $_GET['podai_n'] ) : 0 ) ), // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			'sync_failed'    => array( 'error', __( 'Sync failed:', 'pod-ai-chat-for-woocommerce' ) . ' ' . $err ),
			'ticket_saved'   => array( 'success', __( 'Ticket updated.', 'pod-ai-chat-for-woocommerce' ) ),
			'ticket_failed'  => array( 'error', __( 'The ticket could not be updated.', 'pod-ai-chat-for-woocommerce' ) ),
			'billing_failed' => array( 'error', __( 'Billing is not available right now:', 'pod-ai-chat-for-woocommerce' ) . ' ' . $err ),
			'billing_return' => array( 'success', __( 'Thank you! Your plan is updated as soon as Paddle confirms the payment (usually within a minute).', 'pod-ai-chat-for-woocommerce' ) ),
		);
		if ( isset( $map[ $code ] ) ) {
			printf( '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>', esc_attr( $map[ $code ][0] ), esc_html( $map[ $code ][1] ) );
		}
	}

	/**
	 * What is sent to Pod.AI after the admin connects, plus terms and privacy links.
	 */
	private static function service_disclosure() {
		echo '<p>' . esc_html__( 'This plugin is a client for the Pod.AI hosted service. Nothing is sent until you click Connect to Pod.AI. After you connect, Pod.AI receives:', 'pod-ai-chat-for-woocommerce' ) . '</p>';
		echo '<ul class="podai-data-list">';
		echo '<li>' . esc_html__( 'On connect: your site URL, REST URL, store name, admin e-mail, currency, locale, and WordPress / WooCommerce / plugin versions.', 'pod-ai-chat-for-woocommerce' ) . '</li>';
		echo '<li>' . esc_html__( 'Product sync (when you connect, when you save a product, and once a day): title, short description, prices, currency, image URL, product URL, in-stock status, type, purchasable and on-sale flags, categories, tags, and visible variations (title, price, in-stock status). SKUs and exact stock quantities are not sent unless you opt in below.', 'pod-ai-chat-for-woocommerce' ) . '</li>';
		echo '<li>' . esc_html__( 'Store settings you configure: policy page titles and text, shipping zones and costs, ticket e-mail, widget settings, FAQ, and the public coupon (if you set one).', 'pod-ai-chat-for-woocommerce' ) . '</li>';
		echo '<li>' . esc_html__( 'Chat messages typed by shoppers, and the e-mail a shopper leaves for a ticket.', 'pod-ai-chat-for-woocommerce' ) . '</li>';
		echo '<li>' . esc_html__( 'Order data is never synced. When a shopper gives an order number and billing e-mail, Pod.AI asks your site and receives only status, items, total and tracking.', 'pod-ai-chat-for-woocommerce' ) . '</li>';
		echo '</ul><p>';
		/* translators: 1: terms URL, 2: privacy URL. */
		$terms = __( 'Terms: <a href="%1$s" target="_blank" rel="noopener noreferrer">%1$s</a>. Privacy: <a href="%2$s" target="_blank" rel="noopener noreferrer">%2$s</a>. Disconnecting or uninstalling deletes your store\'s data at Pod.AI.', 'pod-ai-chat-for-woocommerce' );
		printf(
			wp_kses(
				$terms,
				array(
					'a' => array(
						'href'   => array(),
						'target' => array(),
						'rel'    => array(),
					),
				)
			),
			esc_url( 'https://podai.swisspro.site/terms' ),
			esc_url( 'https://podai.swisspro.site/privacy' )
		);
		echo '</p>';
	}

	/**
	 * Opt-in checkbox for SKUs and exact stock quantities (off by default).
	 *
	 * @param string $opt     Settings option name, or empty when the field is posted as sync_sku_stock.
	 * @param array  $s       Current settings.
	 * @param bool   $in_form Whether the field belongs to the Settings API form.
	 */
	private static function sku_stock_checkbox( $opt, $s, $in_form ) {
		$name = $in_form ? $opt . '[sync_sku_stock]' : 'sync_sku_stock';
		echo '<p><label><input type="checkbox" name="' . esc_attr( $name ) . '" value="1" ' . checked( ! empty( $s['sync_sku_stock'] ), true, false ) . '> ' . esc_html__( 'Also send SKUs and exact stock quantities (off by default). If this is unchecked, only in-stock status is sent.', 'pod-ai-chat-for-woocommerce' ) . '</label></p>';
	}

	/**
	 * Page select.
	 *
	 * @param string $name     Field.
	 * @param int    $selected Selected id.
	 */
	private static function page_select( $name, $selected ) {
		wp_dropdown_pages(
			array(
				'name'              => esc_attr( PodAI_Chat_Plugin::OPTION . '[' . $name . ']' ),
				'selected'          => absint( $selected ),
				'show_option_none'  => esc_html__( '— None —', 'pod-ai-chat-for-woocommerce' ),
				'option_none_value' => '0',
			)
		);
	}

	/**
	 * Settings page.
	 */
	public static function page_settings() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$s   = PodAI_Chat_Plugin::settings();
		$opt = PodAI_Chat_Plugin::OPTION;
		echo '<div class="wrap podai-wrap"><h1>' . esc_html__( 'Pod.AI Chat', 'pod-ai-chat-for-woocommerce' ) . '</h1>';
		self::notices();
		settings_errors( 'podai_chat' );

		// 1) connection.
		echo '<div class="card"><h2>' . esc_html__( '1. Connection', 'pod-ai-chat-for-woocommerce' ) . '</h2>';
		if ( PodAI_Chat_Plugin::connected() ) {
			$st = PodAI_Chat_Client::request( 'GET', 'status', null, 10 );
			echo '<p><span class="podai-badge">' . esc_html__( 'Connected', 'pod-ai-chat-for-woocommerce' ) . '</span> ' . esc_html__( 'Site key:', 'pod-ai-chat-for-woocommerce' ) . ' <code>' . esc_html( $s['site_id'] ) . '</code> · ' . esc_html( $s['backend'] ) . '</p>';
			if ( ! is_wp_error( $st ) ) {
				$b = $st['billing'];
				echo '<div class="podai-kpi">';
				echo '<div><b>' . esc_html( $b['name'] ) . '</b>' . esc_html__( 'Plan', 'pod-ai-chat-for-woocommerce' ) . '</div>';
				/* translators: 1: chats used, 2: monthly limit. */
				echo '<div><b>' . esc_html( sprintf( __( '%1$d / %2$d', 'pod-ai-chat-for-woocommerce' ), $b['used'], $b['limit'] ) ) . '</b>' . esc_html__( 'Chats this month', 'pod-ai-chat-for-woocommerce' ) . '</div>';
				echo '<div><b>' . esc_html( (string) $st['catalog']['in_stock'] ) . ' / ' . esc_html( (string) $st['catalog']['products'] ) . '</b>' . esc_html__( 'Products in stock / synced', 'pod-ai-chat-for-woocommerce' ) . '</div>';
				echo '<div><b>' . esc_html( $s['last_sync'] ? $s['last_sync'] : '—' ) . '</b>' . esc_html__( 'Last full sync', 'pod-ai-chat-for-woocommerce' ) . '</div>';
				echo '</div>';
			} else {
				echo '<p><span class="podai-badge off">' . esc_html__( 'Pod.AI is not reachable right now.', 'pod-ai-chat-for-woocommerce' ) . '</span> ' . esc_html( $st->get_error_message() ) . '</p>';
			}
			echo '<p><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="podai-inline-form">';
			wp_nonce_field( 'podai_chat_sync' );
			echo '<input type="hidden" name="action" value="podai_chat_sync">';
			submit_button( __( 'Sync products now', 'pod-ai-chat-for-woocommerce' ), 'secondary', 'submit', false );
			echo '</form> <form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="podai-inline-form podai-disconnect" data-podai-confirm="' . esc_attr( __( 'Disconnect and delete this store\'s data at Pod.AI (tickets, chats, products)?', 'pod-ai-chat-for-woocommerce' ) ) . '">';
			wp_nonce_field( 'podai_chat_disconnect' );
			echo '<input type="hidden" name="action" value="podai_chat_disconnect">';
			submit_button( __( 'Disconnect', 'pod-ai-chat-for-woocommerce' ), 'delete', 'submit', false );
			echo '</form></p>';
		} else {
			self::service_disclosure();
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
			wp_nonce_field( 'podai_chat_connect' );
			echo '<input type="hidden" name="action" value="podai_chat_connect">';
			echo '<p><label>' . esc_html__( 'Pod.AI service URL', 'pod-ai-chat-for-woocommerce' ) . '<br><input type="url" class="regular-text" name="backend" value="' . esc_attr( $s['backend'] ) . '"></label></p>';
			self::sku_stock_checkbox( '', $s, false );
			submit_button( __( 'Connect to Pod.AI', 'pod-ai-chat-for-woocommerce' ), 'primary', 'submit', false );
			echo '</form>';
		}
		echo '</div>';

		// 2) settings.
		echo '<form method="post" action="options.php">';
		settings_fields( 'podai_chat' );
		if ( PodAI_Chat_Plugin::connected() ) {
			echo '<div class="card"><h2>' . esc_html__( 'Product sync', 'pod-ai-chat-for-woocommerce' ) . '</h2>';
			self::sku_stock_checkbox( $opt, $s, true );
			echo '<p class="description">' . esc_html__( 'After changing this, click “Sync products now” so Pod.AI updates or removes previously sent SKUs and quantities.', 'pod-ai-chat-for-woocommerce' ) . '</p></div>';
		}
		echo '<div class="card"><h2>' . esc_html__( '2. Chat and tickets', 'pod-ai-chat-for-woocommerce' ) . '</h2><table class="form-table" role="presentation">';
		echo '<tr><th>' . esc_html__( 'Chat on the storefront', 'pod-ai-chat-for-woocommerce' ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $opt ) . '[enabled]" value="1" ' . checked( $s['enabled'], 1, false ) . '> ' . esc_html__( 'Show the chat widget', 'pod-ai-chat-for-woocommerce' ) . '</label></td></tr>';
		echo '<tr><th><label for="podai-te">' . esc_html__( 'Ticket e-mail', 'pod-ai-chat-for-woocommerce' ) . '</label></th><td><input id="podai-te" type="email" class="regular-text" name="' . esc_attr( $opt ) . '[ticket_email]" value="' . esc_attr( $s['ticket_email'] ) . '" placeholder="' . esc_attr( get_option( 'admin_email' ) ) . '"><p class="description">' . esc_html__( 'When a shopper clicks "contact us" and leaves an e-mail, a ticket is created and the chat transcript is sent here. Reply to that e-mail to answer the shopper.', 'pod-ai-chat-for-woocommerce' ) . '</p></td></tr>';
		echo '<tr><th><label for="podai-rh">' . esc_html__( 'Reply time (hours)', 'pod-ai-chat-for-woocommerce' ) . '</label></th><td><input id="podai-rh" type="number" min="1" max="168" name="' . esc_attr( $opt ) . '[reply_hours]" value="' . esc_attr( (string) $s['reply_hours'] ) . '"></td></tr>';
		echo '<tr><th><label for="podai-gr">' . esc_html__( 'Greeting', 'pod-ai-chat-for-woocommerce' ) . '</label></th><td><input id="podai-gr" type="text" class="large-text" name="' . esc_attr( $opt ) . '[greeting]" value="' . esc_attr( $s['greeting'] ) . '" placeholder="' . esc_attr__( 'Hi! Ask me about products, shipping or your order.', 'pod-ai-chat-for-woocommerce' ) . '"></td></tr>';
		echo '</table></div>';

		echo '<div class="card"><h2>' . esc_html__( '3. Widget', 'pod-ai-chat-for-woocommerce' ) . '</h2><table class="form-table" role="presentation">';
		echo '<tr><th><label for="podai-co">' . esc_html__( 'Colour', 'pod-ai-chat-for-woocommerce' ) . '</label></th><td><input id="podai-co" type="color" name="' . esc_attr( $opt ) . '[color]" value="' . esc_attr( $s['color'] ) . '"></td></tr>';
		echo '<tr><th>' . esc_html__( 'Position', 'pod-ai-chat-for-woocommerce' ) . '</th><td><select name="' . esc_attr( $opt ) . '[position]"><option value="right" ' . selected( $s['position'], 'right', false ) . '>' . esc_html__( 'Bottom right', 'pod-ai-chat-for-woocommerce' ) . '</option><option value="left" ' . selected( $s['position'], 'left', false ) . '>' . esc_html__( 'Bottom left', 'pod-ai-chat-for-woocommerce' ) . '</option></select></td></tr>';
		$langs = array(
			'auto' => __( 'Automatic (shopper / store language)', 'pod-ai-chat-for-woocommerce' ),
			'en'   => 'English',
			'de'   => 'Deutsch',
			'fr'   => 'Français',
			'it'   => 'Italiano',
			'zh'   => '中文',
		);
		echo '<tr><th>' . esc_html__( 'Language', 'pod-ai-chat-for-woocommerce' ) . '</th><td><select name="' . esc_attr( $opt ) . '[language]">';
		foreach ( $langs as $k => $label ) {
			echo '<option value="' . esc_attr( $k ) . '" ' . selected( $s['language'], $k, false ) . '>' . esc_html( $label ) . '</option>';
		}
		echo '</select></td></tr>';
		echo '<tr><th><label for="podai-ti">' . esc_html__( 'Header title', 'pod-ai-chat-for-woocommerce' ) . '</label></th><td><input id="podai-ti" type="text" class="regular-text" name="' . esc_attr( $opt ) . '[title]" value="' . esc_attr( $s['title'] ) . '" placeholder="' . esc_attr( get_bloginfo( 'name' ) ) . '"></td></tr>';
		echo '</table></div>';

		echo '<div class="card"><h2>' . esc_html__( '4. Knowledge', 'pod-ai-chat-for-woocommerce' ) . '</h2><p>' . esc_html__( 'The assistant answers from your store catalogue and the pages below, through the Pod.AI service you connect in this screen. No third-party LLM API key is required. You can optionally add your own LLM key in your Pod.AI account.', 'pod-ai-chat-for-woocommerce' ) . '</p><table class="form-table" role="presentation">';
		echo '<tr><th>' . esc_html__( 'Shipping information page', 'pod-ai-chat-for-woocommerce' ) . '</th><td>';
		self::page_select( 'shipping_page', $s['shipping_page'] );
		echo '</td></tr><tr><th>' . esc_html__( 'Contact page', 'pod-ai-chat-for-woocommerce' ) . '</th><td>';
		self::page_select( 'contact_page', $s['contact_page'] );
		echo '</td></tr>';
		echo '<tr><th><label for="podai-faq">' . esc_html__( 'FAQ', 'pod-ai-chat-for-woocommerce' ) . '</label></th><td><textarea id="podai-faq" class="large-text code" rows="8" name="' . esc_attr( $opt ) . '[faq]" placeholder="' . esc_attr__( "Do you offer gift wrapping?\nYes, gift wrapping is free — add a note at checkout.\n\nCan I pick up my order?\nYes, in our Zurich shop Mon–Sat.", 'pod-ai-chat-for-woocommerce' ) . '">' . esc_textarea( $s['faq'] ) . '</textarea><p class="description">' . esc_html__( 'One question per block: first line = question, next lines = answer, blank line between blocks.', 'pod-ai-chat-for-woocommerce' ) . '</p></td></tr>';
		echo '<tr><th><label for="podai-pc">' . esc_html__( 'Public coupon (optional)', 'pod-ai-chat-for-woocommerce' ) . '</label></th><td><input id="podai-pc" type="text" name="' . esc_attr( $opt ) . '[promo_code]" value="' . esc_attr( $s['promo_code'] ) . '" placeholder="WELCOME10"> <input type="text" class="regular-text" name="' . esc_attr( $opt ) . '[promo_summary]" value="' . esc_attr( $s['promo_summary'] ) . '" placeholder="' . esc_attr__( '10% off your first order', 'pod-ai-chat-for-woocommerce' ) . '"><p class="description">' . esc_html__( 'When a shopper asks for a discount, the chat offers this code and can apply it to their cart. Leave empty to never offer a code.', 'pod-ai-chat-for-woocommerce' ) . '</p></td></tr>';
		echo '</table></div>';

		// 5) AI agents.
		echo '<div class="card"><h2>' . esc_html__( '5. AI agents', 'pod-ai-chat-for-woocommerce' ) . '</h2><table class="form-table">';
		echo '<tr><th>' . esc_html__( 'AI agent access', 'pod-ai-chat-for-woocommerce' ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $opt ) . '[agent_api]" value="1" ' . checked( ! empty( $s['agent_api'] ), true, false ) . '> ' . esc_html__( 'Let AI assistants (ChatGPT, Claude, Grok, Gemini …) search your in-stock products and create a checkout link', 'pod-ai-chat-for-woocommerce' ) . '</label>';
		echo '<p class="description">' . esc_html__( 'Read-only: only in-stock products with their current prices. The shopper reviews the cart and pays in your normal WooCommerce checkout; AI agents never take payment or see orders.', 'pod-ai-chat-for-woocommerce' ) . '</p>';
		if ( isset( $st ) && ! is_wp_error( $st ) && ! empty( $st['agent_api']['mcp'] ) && ! empty( $s['agent_api'] ) ) {
			echo '<p>' . esc_html__( 'MCP server:', 'pod-ai-chat-for-woocommerce' ) . ' <code>' . esc_html( $st['agent_api']['mcp'] ) . '</code><br>' . esc_html__( 'Discovery:', 'pod-ai-chat-for-woocommerce' ) . ' <code>' . esc_html( home_url( '/.well-known/pod-ai-agent.json' ) ) . '</code></p>';
		}
		echo '</td></tr></table></div>';
		submit_button();
		echo '</form>';

		// 6) plan.
		if ( PodAI_Chat_Plugin::connected() && isset( $b ) ) {
			$pay = isset( $b['payments'] ) ? $b['payments'] : array();
			$sub = isset( $b['subscription'] ) ? $b['subscription'] : null;
			$on  = ! empty( $pay['enabled'] );
			echo '<div class="card"><h2>' . esc_html__( '6. Plan', 'pod-ai-chat-for-woocommerce' ) . '</h2><table class="podai-plans widefat striped"><thead><tr><th>' . esc_html__( 'Plan', 'pod-ai-chat-for-woocommerce' ) . '</th><th>' . esc_html__( 'Chats / month', 'pod-ai-chat-for-woocommerce' ) . '</th><th>' . esc_html__( 'Price', 'pod-ai-chat-for-woocommerce' ) . '</th><th></th></tr></thead><tbody>';
			foreach ( $b['plans'] as $p ) {
				$price = $p['price'] ? 'USD ' . $p['price'] . ' / ' . __( 'month', 'pod-ai-chat-for-woocommerce' ) : __( 'Free', 'pod-ai-chat-for-woocommerce' );
				if ( $p['price'] && ! empty( $p['annual_price'] ) ) {
					/* translators: %s: yearly price in USD. */
					$price .= ' · ' . sprintf( __( 'USD %s / year (−20%%)', 'pod-ai-chat-for-woocommerce' ), number_format_i18n( (float) $p['annual_price'], 2 ) );
				}
				echo '<tr><td>' . esc_html( $p['name'] ) . '</td><td>' . esc_html( number_format_i18n( $p['chats'] ) ) . '</td><td>' . esc_html( $price ) . '</td><td>';
				if ( $p['handle'] === $b['plan'] ) {
					echo '<span class="podai-badge">' . esc_html__( 'Current', 'pod-ai-chat-for-woocommerce' ) . '</span>';
					if ( $sub && 'trialing' === $sub['status'] && ! empty( $sub['trial_ends_at'] ) ) {
						/* translators: %s: date. */
						echo ' ' . esc_html( sprintf( __( 'Free trial until %s', 'pod-ai-chat-for-woocommerce' ), mysql2date( get_option( 'date_format' ), get_date_from_gmt( gmdate( 'Y-m-d H:i:s', strtotime( $sub['trial_ends_at'] ) ) ) ) ) );
					}
				} elseif ( $on && $p['price'] && ! $sub ) {
					foreach ( array( 'monthly' => __( 'Monthly', 'pod-ai-chat-for-woocommerce' ), 'annual' => __( 'Yearly', 'pod-ai-chat-for-woocommerce' ) ) as $cycle => $label ) {
						echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="podai-inline-form">';
						wp_nonce_field( 'podai_chat_upgrade' );
						echo '<input type="hidden" name="action" value="podai_chat_upgrade"><input type="hidden" name="plan" value="' . esc_attr( $p['handle'] ) . '"><input type="hidden" name="cycle" value="' . esc_attr( $cycle ) . '">';
						submit_button( $label, 'monthly' === $cycle ? 'primary small' : 'secondary small', 'submit', false );
						echo '</form>';
					}
				}
				echo '</td></tr>';
			}
			echo '</tbody></table>';
			if ( $on ) {
				/* translators: %d: number of trial days. */
				echo '<p class="description">' . esc_html( sprintf( __( 'Paid plans start with a %d-day free trial. Payment is handled by Paddle (merchant of record: invoices and VAT included); cancel any time.', 'pod-ai-chat-for-woocommerce' ), isset( $pay['trial_days'] ) ? (int) $pay['trial_days'] : 14 ) ) . '</p>';
				if ( $sub ) {
					echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
					wp_nonce_field( 'podai_chat_portal' );
					echo '<input type="hidden" name="action" value="podai_chat_portal">';
					submit_button( __( 'Manage billing (change plan, invoices, cancel)', 'pod-ai-chat-for-woocommerce' ), 'secondary', 'submit', false );
					echo '</form>';
				}
			} else {
				echo '<p class="description">' . esc_html__( 'Paid plans are not on sale yet. Contact Pod.AI if you need more chats.', 'pod-ai-chat-for-woocommerce' ) . '</p>';
			}
			echo '</div>';
		}
		echo '</div>';
	}

	/**
	 * Tickets page.
	 */
	public static function page_tickets() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		echo '<div class="wrap"><h1>' . esc_html__( 'Pod.AI tickets', 'pod-ai-chat-for-woocommerce' ) . '</h1>';
		self::notices();
		if ( ! PodAI_Chat_Plugin::connected() ) {
			echo '<p>' . esc_html__( 'Connect Pod.AI first (Pod.AI Chat → Settings).', 'pod-ai-chat-for-woocommerce' ) . '</p></div>';
			return;
		}
		$status = isset( $_GET['status'] ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$open   = isset( $_GET['ticket'] ) ? sanitize_key( wp_unslash( $_GET['ticket'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$list   = PodAI_Chat_Client::request( 'GET', 'tickets' . ( in_array( $status, array( 'open', 'pending', 'closed' ), true ) ? '?status=' . $status : '' ), null, 10 );
		if ( is_wp_error( $list ) ) {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'Pod.AI is not reachable right now.', 'pod-ai-chat-for-woocommerce' ) . '</p></div></div>';
			return;
		}
		$labels = array(
			''        => __( 'All', 'pod-ai-chat-for-woocommerce' ),
			'open'    => __( 'Open', 'pod-ai-chat-for-woocommerce' ),
			'pending' => __( 'Pending', 'pod-ai-chat-for-woocommerce' ),
			'closed'  => __( 'Closed', 'pod-ai-chat-for-woocommerce' ),
		);
		echo '<ul class="subsubsub">';
		$i = 0;
		foreach ( $labels as $k => $label ) {
			echo '<li><a href="' . esc_url( add_query_arg( array( 'page' => 'pod-ai-chat-tickets', 'status' => $k ), admin_url( 'admin.php' ) ) ) . '"' . ( $k === $status ? ' class="current"' : '' ) . '>' . esc_html( $label ) . '</a>' . ( ++$i < count( $labels ) ? ' | ' : '' ) . '</li>';
		}
		echo '</ul><table class="wp-list-table widefat fixed striped"><thead><tr><th class="podai-ticket-col-id">' . esc_html__( 'Ticket', 'pod-ai-chat-for-woocommerce' ) . '</th><th class="podai-ticket-col-status">' . esc_html__( 'Status', 'pod-ai-chat-for-woocommerce' ) . '</th><th>' . esc_html__( 'Customer', 'pod-ai-chat-for-woocommerce' ) . '</th><th>' . esc_html__( 'Order', 'pod-ai-chat-for-woocommerce' ) . '</th><th>' . esc_html__( 'Reason', 'pod-ai-chat-for-woocommerce' ) . '</th><th class="podai-ticket-col-created">' . esc_html__( 'Created', 'pod-ai-chat-for-woocommerce' ) . '</th></tr></thead><tbody>';
		if ( ! $list ) {
			echo '<tr><td colspan="6">' . esc_html__( 'No tickets yet.', 'pod-ai-chat-for-woocommerce' ) . '</td></tr>';
		}
		$current = null;
		foreach ( $list as $t ) {
			if ( $t['id'] === $open ) {
				$current = $t;
			}
			$url = add_query_arg( array( 'page' => 'pod-ai-chat-tickets', 'status' => $status, 'ticket' => $t['id'] ), admin_url( 'admin.php' ) );
			echo '<tr><td><a href="' . esc_url( $url ) . '"><b>' . esc_html( $t['ticket_id'] ? $t['ticket_id'] : __( '(no e-mail yet)', 'pod-ai-chat-for-woocommerce' ) ) . '</b></a></td><td>' . esc_html( $labels[ $t['status'] ] ?? $t['status'] ) . '</td><td>' . esc_html( (string) $t['customer_email'] ) . '</td><td>' . esc_html( (string) $t['order_number'] ) . '</td><td>' . esc_html( $t['reason'] ) . '</td><td>' . esc_html( mysql2date( get_option( 'date_format' ) . ' H:i', get_date_from_gmt( gmdate( 'Y-m-d H:i:s', strtotime( $t['created_at'] ) ) ) ) ) . '</td></tr>';
		}
		echo '</tbody></table>';
		if ( $current ) {
			echo '<div class="card podai-ticket-card"><h2>' . esc_html( $current['ticket_id'] ? $current['ticket_id'] : $current['id'] ) . ' · ' . esc_html( (string) $current['customer_email'] ) . '</h2>';
			echo '<h3>' . esc_html__( 'Chat transcript', 'pod-ai-chat-for-woocommerce' ) . '</h3><div class="podai-transcript">';
			foreach ( $current['messages'] as $m ) {
				$who = 'user' === $m['role'] ? __( 'Customer', 'pod-ai-chat-for-woocommerce' ) : __( 'Assistant', 'pod-ai-chat-for-woocommerce' );
				echo '<p><b>' . esc_html( $who ) . '</b> <span class="podai-muted">' . esc_html( substr( str_replace( 'T', ' ', (string) $m['at'] ), 0, 16 ) ) . '</span><br>' . nl2br( esc_html( $m['text'] ) ) . '</p>';
			}
			echo '</div>';
			if ( $current['notes'] ) {
				echo '<h3>' . esc_html__( 'Notes', 'pod-ai-chat-for-woocommerce' ) . '</h3><ul>';
				foreach ( $current['notes'] as $n ) {
					echo '<li><span class="podai-muted">' . esc_html( substr( str_replace( 'T', ' ', (string) $n['at'] ), 0, 16 ) ) . '</span> — ' . esc_html( $n['text'] ) . '</li>';
				}
				echo '</ul>';
			}
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
			wp_nonce_field( 'podai_chat_ticket' );
			echo '<input type="hidden" name="action" value="podai_chat_ticket"><input type="hidden" name="ticket" value="' . esc_attr( $current['id'] ) . '">';
			echo '<p><label>' . esc_html__( 'Status', 'pod-ai-chat-for-woocommerce' ) . ' <select name="status">';
			foreach ( array( 'open', 'pending', 'closed' ) as $k ) {
				echo '<option value="' . esc_attr( $k ) . '" ' . selected( $current['status'], $k, false ) . '>' . esc_html( $labels[ $k ] ) . '</option>';
			}
			echo '</select></label></p><p><label>' . esc_html__( 'Add a note (internal)', 'pod-ai-chat-for-woocommerce' ) . '<br><textarea name="note" rows="3" class="large-text"></textarea></label></p>';
			if ( $current['customer_email'] ) {
				echo '<p><a class="button" href="' . esc_url( 'mailto:' . $current['customer_email'] . '?subject=' . rawurlencode( (string) $current['ticket_id'] ) ) . '">' . esc_html__( 'Reply by e-mail', 'pod-ai-chat-for-woocommerce' ) . '</a></p>';
			}
			submit_button( __( 'Save ticket', 'pod-ai-chat-for-woocommerce' ) );
			echo '</form></div>';
		}
		echo '</div>';
	}
}
