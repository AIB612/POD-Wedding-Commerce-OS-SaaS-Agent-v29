<?php
/**
 * Signed HTTP client for the Pod.AI backend + signature check for callbacks from it.
 *
 * Signature v1 (both directions): hex HMAC-SHA256( secret, "{ts}\n{METHOD}\n{route}\n{nonce}\n{sha256(body)}" ),
 * headers X-PodAI-Site, X-PodAI-Timestamp, X-PodAI-Nonce, X-PodAI-Signature: v1=<hex>. The query string is not signed.
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Backend client.
 */
class PodAI_Chat_Client {

	/**
	 * Backend base URL (no trailing slash).
	 *
	 * @return string
	 */
	public static function backend() {
		$s = PodAI_Chat_Plugin::settings();
		return untrailingslashit( esc_url_raw( $s['backend'] ? $s['backend'] : PODAI_CHAT_BACKEND ) );
	}

	/**
	 * Compute a signature.
	 *
	 * @param string $secret Secret.
	 * @param int    $ts     Unix time.
	 * @param string $method HTTP method.
	 * @param string $route  Logical route.
	 * @param string $nonce  Nonce.
	 * @param string $body   Raw body.
	 * @return string
	 */
	public static function sign( $secret, $ts, $method, $route, $nonce, $body ) {
		return hash_hmac( 'sha256', $ts . "\n" . strtoupper( $method ) . "\n" . $route . "\n" . $nonce . "\n" . hash( 'sha256', (string) $body ), $secret );
	}

	/**
	 * Signed request to /woo-agent/v1/{path}.
	 *
	 * @param string     $method GET|POST|PATCH.
	 * @param string     $path   e.g. "chat", "tickets?status=open".
	 * @param array|null $data   JSON body.
	 * @param int        $timeout Seconds.
	 * @return array|WP_Error Decoded JSON.
	 */
	public static function request( $method, $path, $data = null, $timeout = 15 ) {
		$s = PodAI_Chat_Plugin::settings();
		if ( empty( $s['site_id'] ) || empty( $s['secret'] ) ) {
			return new WP_Error( 'podai_not_connected', __( 'Pod.AI is not connected yet.', 'pod-ai-chat' ) );
		}
		$path  = ltrim( $path, '/' );
		$route = '/woo-agent/v1/' . strtok( $path, '?' );
		$body  = null === $data ? '' : wp_json_encode( $data );
		$ts    = time();
		$nonce = wp_generate_password( 24, false, false );
		$args  = array(
			'method'      => strtoupper( $method ),
			'timeout'     => $timeout,
			'redirection' => 0,
			'headers'     => array(
				'Content-Type'      => 'application/json',
				'Accept'            => 'application/json',
				'X-PodAI-Site'      => $s['site_id'],
				'X-PodAI-Timestamp' => (string) $ts,
				'X-PodAI-Nonce'     => $nonce,
				'X-PodAI-Signature' => 'v1=' . self::sign( $s['secret'], $ts, $method, $route, $nonce, $body ),
			),
		);
		if ( 'GET' !== strtoupper( $method ) ) {
			$args['body'] = $body;
		}
		$res = wp_remote_request( self::backend() . '/woo-agent/v1/' . $path, $args );
		return self::decode( $res );
	}

	/**
	 * Decode a response.
	 *
	 * @param array|WP_Error $res Response.
	 * @return array|WP_Error
	 */
	public static function decode( $res ) {
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$json = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( $code >= 400 || ! is_array( $json ) ) {
			$err = is_array( $json ) && ! empty( $json['error'] ) ? sanitize_key( $json['error'] ) : 'http_' . $code;
			return new WP_Error( 'podai_' . $err, $err, array( 'status' => $code ) );
		}
		return $json;
	}

	/**
	 * Register this site with the backend (verified through /pod-ai/v1/verify).
	 *
	 * @param string $backend Backend URL.
	 * @return array|WP_Error
	 */
	public static function register( $backend ) {
		$nonce = wp_generate_password( 40, false, false );
		set_transient( 'podai_chat_verify_nonce', $nonce, 10 * MINUTE_IN_SECONDS );
		$payload = array(
			'site_url'    => home_url( '/' ),
			'rest_url'    => get_rest_url(),
			'name'        => wp_strip_all_tags( get_bloginfo( 'name' ) ),
			'admin_email' => get_option( 'admin_email' ),
			'nonce'       => $nonce,
			'currency'    => function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : '',
			'locale'      => get_locale(),
			'versions'    => array(
				'wp'     => get_bloginfo( 'version' ),
				'wc'     => defined( 'WC_VERSION' ) ? WC_VERSION : '',
				'plugin' => PODAI_CHAT_VERSION,
			),
		);
		$res = wp_remote_post(
			untrailingslashit( $backend ) . '/woo-agent/v1/register',
			array(
				'timeout'     => 20,
				'redirection' => 0,
				'headers'     => array( 'Content-Type' => 'application/json' ),
				'body'        => wp_json_encode( $payload ),
			)
		);
		delete_transient( 'podai_chat_verify_nonce' );
		return self::decode( $res );
	}

	/**
	 * Verify a signed callback from the backend.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error
	 */
	public static function verify_callback( WP_REST_Request $request ) {
		$s = PodAI_Chat_Plugin::settings();
		if ( empty( $s['site_id'] ) || empty( $s['secret'] ) ) {
			return new WP_Error( 'podai_not_connected', 'not_connected', array( 'status' => 401 ) );
		}
		$site  = (string) $request->get_header( 'x_podai_site' );
		$ts    = (int) $request->get_header( 'x_podai_timestamp' );
		$nonce = (string) $request->get_header( 'x_podai_nonce' );
		$sig   = (string) $request->get_header( 'x_podai_signature' );
		if ( ! hash_equals( $s['site_id'], $site ) || abs( time() - $ts ) > 300 || ! preg_match( '/^[A-Za-z0-9]{16,64}$/', $nonce ) || 0 !== strpos( $sig, 'v1=' ) ) {
			return new WP_Error( 'podai_bad_signature', 'bad_signature', array( 'status' => 401 ) );
		}
		$expected = self::sign( $s['secret'], $ts, $request->get_method(), $request->get_route(), $nonce, $request->get_body() );
		if ( ! hash_equals( $expected, substr( $sig, 3 ) ) ) {
			return new WP_Error( 'podai_bad_signature', 'bad_signature', array( 'status' => 401 ) );
		}
		$key = 'podai_n_' . md5( $nonce );
		if ( get_transient( $key ) ) {
			return new WP_Error( 'podai_replayed', 'replayed', array( 'status' => 401 ) );
		}
		set_transient( $key, 1, 10 * MINUTE_IN_SECONDS );
		return true;
	}
}
