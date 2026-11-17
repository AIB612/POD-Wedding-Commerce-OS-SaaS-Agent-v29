<?php
/**
 * WP admin: Pod.AI menu with Settings (connect, widget, ticket e-mail, knowledge, sync, plan) and Tickets.
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
	 * Hooks.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'admin_post_podai_chat_connect', array( __CLASS__, 'connect' ) );
		add_action( 'admin_post_podai_chat_disconnect', array( __CLASS__, 'disconnect' ) );
		add_action( 'admin_post_podai_chat_sync', array( __CLASS__, 'sync' ) );
		add_action( 'admin_post_podai_chat_ticket', array( __CLASS__, 'ticket_update' ) );
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
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=pod-ai-chat' ) ) . '">' . esc_html__( 'Settings', 'pod-ai-chat' ) . '</a>' );
		return $links;
	}

	/**
	 * Menu.
	 */
	public static function menu() {
		$icon = 'data:image/svg+xml;base64,' . base64_encode( '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#a7aaad" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		add_menu_page( __( 'Pod.AI Chat', 'pod-ai-chat' ), __( 'Pod.AI Chat', 'pod-ai-chat' ), self::CAP, 'pod-ai-chat', array( __CLASS__, 'page_settings' ), $icon, 56 );
		add_submenu_page( 'pod-ai-chat', __( 'Settings', 'pod-ai-chat' ), __( 'Settings', 'pod-ai-chat' ), self::CAP, 'pod-ai-chat', array( __CLASS__, 'page_settings' ) );
		add_submenu_page( 'pod-ai-chat', __( 'Tickets', 'pod-ai-chat' ), __( 'Tickets', 'pod-ai-chat' ), self::CAP, 'pod-ai-chat-tickets', array( __CLASS__, 'page_tickets' ) );
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
	 * Sanitize the form; connection fields are never taken from the form.
	 *
	 * @param array $in Input.
	 * @return array
	 */
	public static function sanitize( $in ) {
		$cur = PodAI_Chat_Plugin::settings();
		$in  = is_array( $in ) ? $in : array();
		if ( empty( $in['_form'] ) ) {
			return array_merge( $cur, $in ); // internal update_option() calls (connection, sync status).
		}
		$color = sanitize_hex_color( isset( $in['color'] ) ? $in['color'] : '' );
		$code  = strtoupper( preg_replace( '/[^A-Za-z0-9_-]/', '', isset( $in['promo_code'] ) ? $in['promo_code'] : '' ) );
		return array_merge(
			$cur,
			array(
				'enabled'       => empty( $in['enabled'] ) ? 0 : 1,
				'ticket_email'  => sanitize_email( isset( $in['ticket_email'] ) ? $in['ticket_email'] : '' ),
				'color'         => $color ? $color : '#2b2520',
				'position'      => isset( $in['position'] ) && 'left' === $in['position'] ? 'left' : 'right',
				'language'      => isset( $in['language'] ) && in_array( $in['language'], array( 'auto', 'en', 'de', 'fr', 'it', 'zh' ), true ) ? $in['language'] : 'auto',
				'title'         => sanitize_text_field( isset( $in['title'] ) ? $in['title'] : '' ),
				'greeting'      => sanitize_text_field( isset( $in['greeting'] ) ? $in['greeting'] : '' ),
				'shipping_page' => absint( isset( $in['shipping_page'] ) ? $in['shipping_page'] : 0 ),
				'contact_page'  => absint( isset( $in['contact_page'] ) ? $in['contact_page'] : 0 ),
				'promo_code'    => substr( $code, 0, 40 ),
				'promo_summary' => sanitize_text_field( isset( $in['promo_summary'] ) ? $in['promo_summary'] : '' ),
				'faq'           => sanitize_textarea_field( isset( $in['faq'] ) ? $in['faq'] : '' ),
				'reply_hours'   => max( 1, min( 168, absint( isset( $in['reply_hours'] ) ? $in['reply_hours'] : 24 ) ) ),
			)
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
			add_settings_error( 'podai_chat', 'push', __( 'Saved, but Pod.AI could not be updated:', 'pod-ai-chat' ) . ' ' . $res->get_error_message() );
		}
	}

	/**
	 * Check capability + nonce.
	 *
	 * @param string $action Action.
	 */
	private static function guard( $action ) {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'pod-ai-chat' ) );
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
		PodAI_Chat_Plugin::update(
			array(
				'backend' => untrailingslashit( $backend ),
				'site_id' => sanitize_text_field( $res['site_id'] ),
				'secret'  => sanitize_text_field( $res['secret'] ),
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
			'connected'      => array( 'success', __( 'Connected to Pod.AI. Your products were synced and the chat is live on your store.', 'pod-ai-chat' ) ),
			'connect_failed' => array( 'error', __( 'Could not connect to Pod.AI:', 'pod-ai-chat' ) . ' ' . $err ),
			'disconnected'   => array( 'success', __( 'Disconnected. Your store data at Pod.AI was deleted.', 'pod-ai-chat' ) ),
			/* translators: %d: number of products. */
			'synced'         => array( 'success', sprintf( __( 'Sync finished: %d products sent.', 'pod-ai-chat' ), isset( $_GET['podai_n'] ) ? absint( $_GET['podai_n'] ) : 0 ) ), // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			'sync_failed'    => array( 'error', __( 'Sync failed:', 'pod-ai-chat' ) . ' ' . $err ),
			'ticket_saved'   => array( 'success', __( 'Ticket updated.', 'pod-ai-chat' ) ),
			'ticket_failed'  => array( 'error', __( 'The ticket could not be updated.', 'pod-ai-chat' ) ),
		);
		if ( isset( $map[ $code ] ) ) {
			printf( '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>', esc_attr( $map[ $code ][0] ), esc_html( $map[ $code ][1] ) );
		}
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
				'show_option_none'  => esc_html__( '— None —', 'pod-ai-chat' ),
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
		echo '<div class="wrap podai-wrap"><h1>' . esc_html__( 'Pod.AI Chat', 'pod-ai-chat' ) . '</h1>';
		self::notices();
		settings_errors( 'podai_chat' );
		echo '<style>.podai-wrap .card{max-width:860px}.podai-kpi{display:flex;gap:28px;flex-wrap:wrap}.podai-kpi div b{display:block;font-size:20px}.podai-plans td,.podai-plans th{padding:6px 12px}.podai-badge{display:inline-block;padding:2px 8px;border-radius:10px;background:#e7f5ee;color:#0a6b3d;font-weight:600}.podai-badge.off{background:#fbeaea;color:#8a1f1f}</style>';

		// 1) connection.
		echo '<div class="card"><h2>' . esc_html__( '1. Connection', 'pod-ai-chat' ) . '</h2>';
		if ( PodAI_Chat_Plugin::connected() ) {
			$st = PodAI_Chat_Client::request( 'GET', 'status', null, 10 );
			echo '<p><span class="podai-badge">' . esc_html__( 'Connected', 'pod-ai-chat' ) . '</span> ' . esc_html__( 'Site key:', 'pod-ai-chat' ) . ' <code>' . esc_html( $s['site_id'] ) . '</code> · ' . esc_html( $s['backend'] ) . '</p>';
			if ( ! is_wp_error( $st ) ) {
				$b = $st['billing'];
				echo '<div class="podai-kpi">';
				echo '<div><b>' . esc_html( $b['name'] ) . '</b>' . esc_html__( 'Plan', 'pod-ai-chat' ) . '</div>';
				/* translators: 1: chats used, 2: monthly limit. */
				echo '<div><b>' . esc_html( sprintf( __( '%1$d / %2$d', 'pod-ai-chat' ), $b['used'], $b['limit'] ) ) . '</b>' . esc_html__( 'Chats this month', 'pod-ai-chat' ) . '</div>';
				echo '<div><b>' . esc_html( (string) $st['catalog']['in_stock'] ) . ' / ' . esc_html( (string) $st['catalog']['products'] ) . '</b>' . esc_html__( 'Products in stock / synced', 'pod-ai-chat' ) . '</div>';
				echo '<div><b>' . esc_html( $s['last_sync'] ? $s['last_sync'] : '—' ) . '</b>' . esc_html__( 'Last full sync', 'pod-ai-chat' ) . '</div>';
				echo '</div>';
			} else {
				echo '<p><span class="podai-badge off">' . esc_html__( 'Pod.AI is not reachable right now.', 'pod-ai-chat' ) . '</span> ' . esc_html( $st->get_error_message() ) . '</p>';
			}
			echo '<p><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="display:inline">';
			wp_nonce_field( 'podai_chat_sync' );
			echo '<input type="hidden" name="action" value="podai_chat_sync">';
			submit_button( __( 'Sync products now', 'pod-ai-chat' ), 'secondary', 'submit', false );
			echo '</form> <form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="display:inline" onsubmit="return confirm(\'' . esc_js( __( 'Disconnect and delete this store\'s data at Pod.AI (tickets, chats, products)?', 'pod-ai-chat' ) ) . '\')">';
			wp_nonce_field( 'podai_chat_disconnect' );
			echo '<input type="hidden" name="action" value="podai_chat_disconnect">';
			submit_button( __( 'Disconnect', 'pod-ai-chat' ), 'delete', 'submit', false );
			echo '</form></p>';
		} else {
			echo '<p>' . esc_html__( 'Connect your store to the Pod.AI service. Your site gets its own key; only public product data, your policies and settings are sent. Orders stay in WooCommerce and are only read when a shopper gives the order number and e-mail.', 'pod-ai-chat' ) . '</p>';
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
			wp_nonce_field( 'podai_chat_connect' );
			echo '<input type="hidden" name="action" value="podai_chat_connect">';
			echo '<p><label>' . esc_html__( 'Pod.AI service URL', 'pod-ai-chat' ) . '<br><input type="url" class="regular-text" name="backend" value="' . esc_attr( $s['backend'] ) . '"></label></p>';
			submit_button( __( 'Connect to Pod.AI', 'pod-ai-chat' ), 'primary', 'submit', false );
			echo '</form>';
		}
		echo '</div>';

		// 2) settings.
		echo '<form method="post" action="options.php">';
		settings_fields( 'podai_chat' );
		echo '<input type="hidden" name="' . esc_attr( $opt ) . '[_form]" value="1">';
		echo '<div class="card"><h2>' . esc_html__( '2. Chat and tickets', 'pod-ai-chat' ) . '</h2><table class="form-table" role="presentation">';
		echo '<tr><th>' . esc_html__( 'Chat on the storefront', 'pod-ai-chat' ) . '</th><td><label><input type="checkbox" name="' . esc_attr( $opt ) . '[enabled]" value="1" ' . checked( $s['enabled'], 1, false ) . '> ' . esc_html__( 'Show the chat widget', 'pod-ai-chat' ) . '</label></td></tr>';
		echo '<tr><th><label for="podai-te">' . esc_html__( 'Ticket e-mail', 'pod-ai-chat' ) . '</label></th><td><input id="podai-te" type="email" class="regular-text" name="' . esc_attr( $opt ) . '[ticket_email]" value="' . esc_attr( $s['ticket_email'] ) . '" placeholder="' . esc_attr( get_option( 'admin_email' ) ) . '"><p class="description">' . esc_html__( 'When a shopper clicks "contact us" and leaves an e-mail, a ticket is created and the chat transcript is sent here. Reply to that e-mail to answer the shopper.', 'pod-ai-chat' ) . '</p></td></tr>';
		echo '<tr><th><label for="podai-rh">' . esc_html__( 'Reply time (hours)', 'pod-ai-chat' ) . '</label></th><td><input id="podai-rh" type="number" min="1" max="168" name="' . esc_attr( $opt ) . '[reply_hours]" value="' . esc_attr( (string) $s['reply_hours'] ) . '"></td></tr>';
		echo '<tr><th><label for="podai-gr">' . esc_html__( 'Greeting', 'pod-ai-chat' ) . '</label></th><td><input id="podai-gr" type="text" class="large-text" name="' . esc_attr( $opt ) . '[greeting]" value="' . esc_attr( $s['greeting'] ) . '" placeholder="' . esc_attr__( 'Hi! Ask me about products, shipping or your order.', 'pod-ai-chat' ) . '"></td></tr>';
		echo '</table></div>';

		echo '<div class="card"><h2>' . esc_html__( '3. Widget', 'pod-ai-chat' ) . '</h2><table class="form-table" role="presentation">';
		echo '<tr><th><label for="podai-co">' . esc_html__( 'Colour', 'pod-ai-chat' ) . '</label></th><td><input id="podai-co" type="color" name="' . esc_attr( $opt ) . '[color]" value="' . esc_attr( $s['color'] ) . '"></td></tr>';
		echo '<tr><th>' . esc_html__( 'Position', 'pod-ai-chat' ) . '</th><td><select name="' . esc_attr( $opt ) . '[position]"><option value="right" ' . selected( $s['position'], 'right', false ) . '>' . esc_html__( 'Bottom right', 'pod-ai-chat' ) . '</option><option value="left" ' . selected( $s['position'], 'left', false ) . '>' . esc_html__( 'Bottom left', 'pod-ai-chat' ) . '</option></select></td></tr>';
		$langs = array(
			'auto' => __( 'Automatic (shopper / store language)', 'pod-ai-chat' ),
			'en'   => 'English',
			'de'   => 'Deutsch',
			'fr'   => 'Français',
			'it'   => 'Italiano',
			'zh'   => '中文',
		);
		echo '<tr><th>' . esc_html__( 'Language', 'pod-ai-chat' ) . '</th><td><select name="' . esc_attr( $opt ) . '[language]">';
		foreach ( $langs as $k => $label ) {
			echo '<option value="' . esc_attr( $k ) . '" ' . selected( $s['language'], $k, false ) . '>' . esc_html( $label ) . '</option>';
		}
		echo '</select></td></tr>';
		echo '<tr><th><label for="podai-ti">' . esc_html__( 'Header title', 'pod-ai-chat' ) . '</label></th><td><input id="podai-ti" type="text" class="regular-text" name="' . esc_attr( $opt ) . '[title]" value="' . esc_attr( $s['title'] ) . '" placeholder="' . esc_attr( get_bloginfo( 'name' ) ) . '"></td></tr>';
		echo '</table></div>';

		echo '<div class="card"><h2>' . esc_html__( '4. Knowledge', 'pod-ai-chat' ) . '</h2><p>' . esc_html__( 'The assistant answers from your refund/returns, terms and privacy pages, your shipping zones and the pages below. No external AI service is used.', 'pod-ai-chat' ) . '</p><table class="form-table" role="presentation">';
		echo '<tr><th>' . esc_html__( 'Shipping information page', 'pod-ai-chat' ) . '</th><td>';
		self::page_select( 'shipping_page', $s['shipping_page'] );
		echo '</td></tr><tr><th>' . esc_html__( 'Contact page', 'pod-ai-chat' ) . '</th><td>';
		self::page_select( 'contact_page', $s['contact_page'] );
		echo '</td></tr>';
		echo '<tr><th><label for="podai-faq">' . esc_html__( 'FAQ', 'pod-ai-chat' ) . '</label></th><td><textarea id="podai-faq" class="large-text code" rows="8" name="' . esc_attr( $opt ) . '[faq]" placeholder="' . esc_attr__( "Do you offer gift wrapping?\nYes, gift wrapping is free — add a note at checkout.\n\nCan I pick up my order?\nYes, in our Zurich shop Mon–Sat.", 'pod-ai-chat' ) . '">' . esc_textarea( $s['faq'] ) . '</textarea><p class="description">' . esc_html__( 'One question per block: first line = question, next lines = answer, blank line between blocks.', 'pod-ai-chat' ) . '</p></td></tr>';
		echo '<tr><th><label for="podai-pc">' . esc_html__( 'Public coupon (optional)', 'pod-ai-chat' ) . '</label></th><td><input id="podai-pc" type="text" name="' . esc_attr( $opt ) . '[promo_code]" value="' . esc_attr( $s['promo_code'] ) . '" placeholder="WELCOME10"> <input type="text" class="regular-text" name="' . esc_attr( $opt ) . '[promo_summary]" value="' . esc_attr( $s['promo_summary'] ) . '" placeholder="' . esc_attr__( '10% off your first order', 'pod-ai-chat' ) . '"><p class="description">' . esc_html__( 'When a shopper asks for a discount, the chat offers this code and can apply it to their cart. Leave empty to never offer a code.', 'pod-ai-chat' ) . '</p></td></tr>';
		echo '</table></div>';
		submit_button();
		echo '</form>';

		// 5) plan.
		if ( PodAI_Chat_Plugin::connected() && isset( $b ) ) {
			echo '<div class="card"><h2>' . esc_html__( '5. Plan', 'pod-ai-chat' ) . '</h2><table class="podai-plans widefat striped"><thead><tr><th>' . esc_html__( 'Plan', 'pod-ai-chat' ) . '</th><th>' . esc_html__( 'Chats / month', 'pod-ai-chat' ) . '</th><th>' . esc_html__( 'Price', 'pod-ai-chat' ) . '</th><th></th></tr></thead><tbody>';
			foreach ( $b['plans'] as $p ) {
				echo '<tr><td>' . esc_html( $p['name'] ) . '</td><td>' . esc_html( number_format_i18n( $p['chats'] ) ) . '</td><td>' . esc_html( $p['price'] ? 'USD ' . $p['price'] : __( 'Free', 'pod-ai-chat' ) ) . '</td><td>' . ( $p['handle'] === $b['plan'] ? '<span class="podai-badge">' . esc_html__( 'Current', 'pod-ai-chat' ) . '</span>' : '' ) . '</td></tr>';
			}
			echo '</tbody></table><p class="description">' . esc_html__( 'Paid plans are not on sale yet. Contact Pod.AI if you need more chats.', 'pod-ai-chat' ) . '</p></div>';
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
		echo '<div class="wrap"><h1>' . esc_html__( 'Pod.AI tickets', 'pod-ai-chat' ) . '</h1>';
		self::notices();
		if ( ! PodAI_Chat_Plugin::connected() ) {
			echo '<p>' . esc_html__( 'Connect Pod.AI first (Pod.AI Chat → Settings).', 'pod-ai-chat' ) . '</p></div>';
			return;
		}
		$status = isset( $_GET['status'] ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$open   = isset( $_GET['ticket'] ) ? sanitize_key( wp_unslash( $_GET['ticket'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$list   = PodAI_Chat_Client::request( 'GET', 'tickets' . ( in_array( $status, array( 'open', 'pending', 'closed' ), true ) ? '?status=' . $status : '' ), null, 10 );
		if ( is_wp_error( $list ) ) {
			echo '<div class="notice notice-error"><p>' . esc_html__( 'Pod.AI is not reachable right now.', 'pod-ai-chat' ) . '</p></div></div>';
			return;
		}
		$labels = array(
			''        => __( 'All', 'pod-ai-chat' ),
			'open'    => __( 'Open', 'pod-ai-chat' ),
			'pending' => __( 'Pending', 'pod-ai-chat' ),
			'closed'  => __( 'Closed', 'pod-ai-chat' ),
		);
		echo '<ul class="subsubsub">';
		$i = 0;
		foreach ( $labels as $k => $label ) {
			echo '<li><a href="' . esc_url( add_query_arg( array( 'page' => 'pod-ai-chat-tickets', 'status' => $k ), admin_url( 'admin.php' ) ) ) . '"' . ( $k === $status ? ' class="current"' : '' ) . '>' . esc_html( $label ) . '</a>' . ( ++$i < count( $labels ) ? ' | ' : '' ) . '</li>';
		}
		echo '</ul><table class="wp-list-table widefat fixed striped"><thead><tr><th style="width:130px">' . esc_html__( 'Ticket', 'pod-ai-chat' ) . '</th><th style="width:90px">' . esc_html__( 'Status', 'pod-ai-chat' ) . '</th><th>' . esc_html__( 'Customer', 'pod-ai-chat' ) . '</th><th>' . esc_html__( 'Order', 'pod-ai-chat' ) . '</th><th>' . esc_html__( 'Reason', 'pod-ai-chat' ) . '</th><th style="width:150px">' . esc_html__( 'Created', 'pod-ai-chat' ) . '</th></tr></thead><tbody>';
		if ( ! $list ) {
			echo '<tr><td colspan="6">' . esc_html__( 'No tickets yet.', 'pod-ai-chat' ) . '</td></tr>';
		}
		$current = null;
		foreach ( $list as $t ) {
			if ( $t['id'] === $open ) {
				$current = $t;
			}
			$url = add_query_arg( array( 'page' => 'pod-ai-chat-tickets', 'status' => $status, 'ticket' => $t['id'] ), admin_url( 'admin.php' ) );
			echo '<tr><td><a href="' . esc_url( $url ) . '"><b>' . esc_html( $t['ticket_id'] ? $t['ticket_id'] : __( '(no e-mail yet)', 'pod-ai-chat' ) ) . '</b></a></td><td>' . esc_html( $labels[ $t['status'] ] ?? $t['status'] ) . '</td><td>' . esc_html( (string) $t['customer_email'] ) . '</td><td>' . esc_html( (string) $t['order_number'] ) . '</td><td>' . esc_html( $t['reason'] ) . '</td><td>' . esc_html( mysql2date( get_option( 'date_format' ) . ' H:i', get_date_from_gmt( gmdate( 'Y-m-d H:i:s', strtotime( $t['created_at'] ) ) ) ) ) . '</td></tr>';
		}
		echo '</tbody></table>';
		if ( $current ) {
			echo '<div class="card" style="max-width:900px;margin-top:20px"><h2>' . esc_html( $current['ticket_id'] ? $current['ticket_id'] : $current['id'] ) . ' · ' . esc_html( (string) $current['customer_email'] ) . '</h2>';
			echo '<h3>' . esc_html__( 'Chat transcript', 'pod-ai-chat' ) . '</h3><div style="max-height:360px;overflow:auto;border:1px solid #dcdcde;padding:8px 12px;background:#fff">';
			foreach ( $current['messages'] as $m ) {
				$who = 'user' === $m['role'] ? __( 'Customer', 'pod-ai-chat' ) : __( 'Assistant', 'pod-ai-chat' );
				echo '<p><b>' . esc_html( $who ) . '</b> <span style="color:#777">' . esc_html( substr( str_replace( 'T', ' ', (string) $m['at'] ), 0, 16 ) ) . '</span><br>' . nl2br( esc_html( $m['text'] ) ) . '</p>';
			}
			echo '</div>';
			if ( $current['notes'] ) {
				echo '<h3>' . esc_html__( 'Notes', 'pod-ai-chat' ) . '</h3><ul>';
				foreach ( $current['notes'] as $n ) {
					echo '<li><span style="color:#777">' . esc_html( substr( str_replace( 'T', ' ', (string) $n['at'] ), 0, 16 ) ) . '</span> — ' . esc_html( $n['text'] ) . '</li>';
				}
				echo '</ul>';
			}
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
			wp_nonce_field( 'podai_chat_ticket' );
			echo '<input type="hidden" name="action" value="podai_chat_ticket"><input type="hidden" name="ticket" value="' . esc_attr( $current['id'] ) . '">';
			echo '<p><label>' . esc_html__( 'Status', 'pod-ai-chat' ) . ' <select name="status">';
			foreach ( array( 'open', 'pending', 'closed' ) as $k ) {
				echo '<option value="' . esc_attr( $k ) . '" ' . selected( $current['status'], $k, false ) . '>' . esc_html( $labels[ $k ] ) . '</option>';
			}
			echo '</select></label></p><p><label>' . esc_html__( 'Add a note (internal)', 'pod-ai-chat' ) . '<br><textarea name="note" rows="3" class="large-text"></textarea></label></p>';
			if ( $current['customer_email'] ) {
				echo '<p><a class="button" href="' . esc_url( 'mailto:' . $current['customer_email'] . '?subject=' . rawurlencode( (string) $current['ticket_id'] ) ) . '">' . esc_html__( 'Reply by e-mail', 'pod-ai-chat' ) . '</a></p>';
			}
			submit_button( __( 'Save ticket', 'pod-ai-chat' ) );
			echo '</form></div>';
		}
		echo '</div>';
	}
}
