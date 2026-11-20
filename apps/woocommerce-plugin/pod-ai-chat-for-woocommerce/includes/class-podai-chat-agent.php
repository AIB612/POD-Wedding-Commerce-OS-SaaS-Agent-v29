<?php
/**
 * AI agent access: prefilled cart links for external AI assistants and discovery of the store's Pod.AI agent API.
 *
 * - https://store/?podai_cart=14:1,17_23:2&coupon=CODE adds the items (product[_variation]:quantity) to the shopper's own
 *   cart and opens the checkout. Same idea as WooCommerce's ?add-to-cart= links; the shopper reviews and pays as usual.
 * - https://store/.well-known/pod-ai-agent.json and the REST route pod-ai/v1/agent tell AI agents where the store's MCP
 *   server and REST API are (hosted by Pod.AI; read-only, in-stock products only).
 *
 * Both are off when "AI agent access" is disabled in Pod.AI Chat → Settings.
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Agent access.
 */
class PodAI_Chat_Agent {

	const MAX_ITEMS = 20;

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'wp_loaded', array( __CLASS__, 'maybe_fill_cart' ), 30 );
		add_action( 'init', array( __CLASS__, 'maybe_well_known' ), 1 );
		add_action( 'wp_head', array( __CLASS__, 'head_link' ), 2 );
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	/**
	 * Agent access on and the site connected?
	 *
	 * @return bool
	 */
	public static function enabled() {
		$s = PodAI_Chat_Plugin::settings();
		return PodAI_Chat_Plugin::connected() && ! empty( $s['agent_api'] );
	}

	/**
	 * Discovery document.
	 *
	 * @return array
	 */
	public static function manifest() {
		$s    = PodAI_Chat_Plugin::settings();
		$base = untrailingslashit( $s['backend'] ) . '/agent/v1/stores/' . rawurlencode( $s['site_id'] );
		return array(
			'schema_version' => '1.0',
			'name'           => wp_strip_all_tags( get_bloginfo( 'name' ) ),
			'url'            => home_url( '/' ),
			'platform'       => 'woocommerce',
			'store'          => $s['site_id'],
			'manifest'       => $base,
			'mcp'            => array(
				'url'       => $base . '/mcp',
				'transport' => 'streamable-http',
				'auth'      => 'none',
			),
			'openapi'        => untrailingslashit( $s['backend'] ) . '/agent/v1/openapi.json',
			'tools'          => array( 'get_store_info', 'search_products', 'get_product', 'create_checkout_link' ),
			'payment'        => 'The shopper completes payment on this store\'s own checkout. AI agents never take payment.',
		);
	}

	/**
	 * REST: GET pod-ai/v1/agent (works with plain permalinks too).
	 */
	public static function routes() {
		register_rest_route(
			'pod-ai/v1',
			'/agent',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => function () {
					if ( ! self::enabled() ) {
						return new WP_Error( 'podai_agent_off', 'AI agent access is off.', array( 'status' => 404 ) );
					}
					return rest_ensure_response( self::manifest() );
				},
			)
		);
	}

	/**
	 * Serve /.well-known/pod-ai-agent.json (when the web server passes the request to WordPress).
	 */
	public static function maybe_well_known() {
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
		$path = (string) wp_parse_url( $uri, PHP_URL_PATH );
		$home = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		if ( untrailingslashit( $home ) . '/.well-known/pod-ai-agent.json' !== $path || ! self::enabled() ) {
			return;
		}
		header( 'Access-Control-Allow-Origin: *' );
		header( 'Cache-Control: public, max-age=3600' );
		wp_send_json( self::manifest() );
	}

	/**
	 * <link> to the discovery document on storefront pages.
	 */
	public static function head_link() {
		if ( self::enabled() ) {
			echo '<link rel="alternate" type="application/json" title="Pod.AI agent API" href="' . esc_url( rest_url( 'pod-ai/v1/agent' ) ) . '">' . "\n";
		}
	}

	/**
	 * ?podai_cart=… → add the items to the shopper's cart, apply the coupon, open the checkout.
	 */
	public static function maybe_fill_cart() {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- public shareable cart link, like ?add-to-cart=; it only changes the visitor's own cart.
		if ( empty( $_GET['podai_cart'] ) || is_admin() || wp_doing_ajax() || ! self::enabled() || ! function_exists( 'WC' ) || ! WC()->cart ) {
			return;
		}
		$raw    = sanitize_text_field( wp_unslash( $_GET['podai_cart'] ) );
		$coupon = isset( $_GET['coupon'] ) ? wc_format_coupon_code( sanitize_text_field( wp_unslash( $_GET['coupon'] ) ) ) : '';
		// phpcs:enable WordPress.Security.NonceVerification.Recommended
		if ( WC()->session && ! WC()->session->has_session() ) {
			WC()->session->set_customer_session_cookie( true );
		}
		$added = 0;
		foreach ( array_slice( explode( ',', $raw ), 0, self::MAX_ITEMS ) as $item ) {
			if ( ! preg_match( '/^(\d{1,20})(?:_(\d{1,20}))?:(\d{1,2})$/', trim( $item ), $m ) ) {
				continue;
			}
			$pid = absint( $m[1] );
			$vid = isset( $m[2] ) && '' !== $m[2] ? absint( $m[2] ) : 0;
			$qty = max( 1, min( 99, absint( $m[3] ) ) );
			$p   = wc_get_product( $vid ? $vid : $pid );
			if ( ! $p || ! $p->is_purchasable() || ! $p->is_in_stock() || 'publish' !== get_post_status( $vid ? $p->get_parent_id() : $pid ) ) {
				continue;
			}
			if ( $vid ) {
				if ( ! $p->is_type( 'variation' ) || (int) $p->get_parent_id() !== $pid ) {
					continue;
				}
				$ok = WC()->cart->add_to_cart( $pid, $qty, $vid, $p->get_variation_attributes() );
			} else {
				if ( ! $p->is_type( 'simple' ) ) {
					continue;
				}
				$ok = WC()->cart->add_to_cart( $pid, $qty );
			}
			$added += $ok ? 1 : 0;
		}
		if ( $added && $coupon && wc_coupons_enabled() && ! WC()->cart->has_discount( $coupon ) ) {
			WC()->cart->apply_coupon( $coupon );
		}
		wp_safe_redirect( $added ? wc_get_checkout_url() : wc_get_cart_url() );
		exit;
	}
}
