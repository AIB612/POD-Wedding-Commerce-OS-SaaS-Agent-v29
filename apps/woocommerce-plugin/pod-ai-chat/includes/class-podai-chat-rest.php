<?php
/**
 * REST routes (namespace pod-ai/v1).
 *   GET  verify   registration proof (echoes the one-time nonce while a registration is running)
 *   POST lookup   signed callback from the Pod.AI backend: order lookup / coupon check
 *   POST chat     storefront widget → backend (signed here; the secret never reaches the browser), per-visitor rate limit
 *   GET  config   widget config (cached 60 s)
 *   POST event    widget events (chat_open, product_click, add_to_cart, coupon_applied, checkout_click)
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * REST API.
 */
class PodAI_Chat_REST {

	const NS = 'pod-ai/v1';

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	/**
	 * Register routes.
	 */
	public static function routes() {
		register_rest_route(
			self::NS,
			'/verify',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'verify' ),
				'permission_callback' => '__return_true', // Public by design: only echoes a nonce that exists for 10 minutes during registration.
			)
		);
		register_rest_route(
			self::NS,
			'/lookup',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'lookup' ),
				'permission_callback' => array( 'PodAI_Chat_Client', 'verify_callback' ),
			)
		);
		register_rest_route(
			self::NS,
			'/chat',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'chat' ),
				'permission_callback' => '__return_true', // Public storefront chat (like a contact form); rate-limited per visitor.
				'args'                => array(
					'message' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/config',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'config' ),
				'permission_callback' => '__return_true', // Public widget configuration (colours, greeting).
			)
		);
		register_rest_route(
			self::NS,
			'/event',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'event' ),
				'permission_callback' => '__return_true', // Anonymous widget analytics events, whitelisted types only.
			)
		);
	}

	/**
	 * Registration proof.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function verify( WP_REST_Request $request ) {
		$nonce = get_transient( 'podai_chat_verify_nonce' );
		$given = (string) $request->get_param( 'nonce' );
		$ok    = $nonce && hash_equals( (string) $nonce, $given );
		return new WP_REST_Response( array( 'nonce' => $ok ? $nonce : '' ), $ok ? 200 : 404 );
	}

	/**
	 * Signed lookup.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function lookup( WP_REST_Request $request ) {
		$b = json_decode( $request->get_body(), true );
		$b = is_array( $b ) ? $b : array();
		if ( isset( $b['type'] ) && 'order' === $b['type'] ) {
			return rest_ensure_response( PodAI_Chat_Orders::lookup( isset( $b['order_number'] ) ? $b['order_number'] : '', isset( $b['email'] ) ? $b['email'] : '' ) );
		}
		if ( isset( $b['type'] ) && 'coupon' === $b['type'] ) {
			return rest_ensure_response( PodAI_Chat_Orders::coupon( isset( $b['code'] ) ? $b['code'] : '' ) );
		}
		return new WP_REST_Response(
			array(
				'ok'    => false,
				'error' => 'unknown_type',
			),
			400
		);
	}

	/**
	 * Visitor rate limit (per IP hash, 20 messages / minute).
	 *
	 * @param string $bucket Bucket.
	 * @param int    $max    Max per minute.
	 * @return bool
	 */
	private static function allow( $bucket, $max ) {
		$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		$key = 'podai_rl_' . $bucket . '_' . md5( $ip . wp_salt( 'nonce' ) );
		$max = (int) apply_filters( 'podai_chat_rate_limit', $max, $bucket );
		$n   = (int) get_transient( $key );
		if ( $n >= $max ) {
			return false;
		}
		set_transient( $key, $n + 1, MINUTE_IN_SECONDS );
		return true;
	}

	/**
	 * Storefront chat.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function chat( WP_REST_Request $request ) {
		if ( ! self::allow( 'chat', 20 ) ) {
			return new WP_REST_Response( array( 'error' => 'rate_limited' ), 429 );
		}
		$conv = (string) $request->get_param( 'conversation_id' );
		$res  = PodAI_Chat_Client::request(
			'POST',
			'chat',
			array(
				'message'         => mb_substr( (string) $request->get_param( 'message' ), 0, 1000 ),
				'conversation_id' => preg_match( '/^c_[a-z0-9]{12,40}$/', $conv ) ? $conv : null,
				'lang'            => substr( sanitize_key( (string) $request->get_param( 'lang' ) ), 0, 5 ),
				'page'            => mb_substr( sanitize_text_field( (string) $request->get_param( 'page' ) ), 0, 200 ),
			),
			20
		);
		if ( is_wp_error( $res ) ) {
			return new WP_REST_Response( array( 'error' => 'chat_unavailable' ), 503 );
		}
		$res = rest_ensure_response( $res );
		$res->header( 'Cache-Control', 'no-store' );
		return $res;
	}

	/**
	 * Widget config.
	 *
	 * @return WP_REST_Response
	 */
	public static function config() {
		$cfg = get_transient( 'podai_chat_config' );
		if ( false === $cfg ) {
			$cfg = PodAI_Chat_Client::request( 'GET', 'config', null, 8 );
			if ( is_wp_error( $cfg ) ) {
				return new WP_REST_Response( array( 'enabled' => false ), 200 );
			}
			set_transient( 'podai_chat_config', $cfg, MINUTE_IN_SECONDS );
		}
		return rest_ensure_response( $cfg );
	}

	/**
	 * Widget event.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function event( WP_REST_Request $request ) {
		$type = sanitize_key( (string) $request->get_param( 'type' ) );
		if ( ! in_array( $type, array( 'chat_open', 'product_click', 'add_to_cart', 'embed_ping', 'coupon_applied', 'checkout_click' ), true ) || ! self::allow( 'event', 60 ) ) {
			return rest_ensure_response( array( 'ok' => false ) );
		}
		PodAI_Chat_Client::request(
			'POST',
			'event',
			array(
				'type'            => $type,
				'product_id'      => sanitize_text_field( (string) $request->get_param( 'product_id' ) ),
				'conversation_id' => sanitize_text_field( (string) $request->get_param( 'conversation_id' ) ),
			),
			5
		);
		return rest_ensure_response( array( 'ok' => true ) );
	}
}
