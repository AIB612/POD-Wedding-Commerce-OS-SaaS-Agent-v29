<?php
/**
 * Storefront widget (front end only, when connected and enabled).
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Widget.
 */
class PodAI_Chat_Widget {

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
	}

	/**
	 * Enqueue the widget.
	 */
	public static function enqueue() {
		$s = PodAI_Chat_Plugin::settings();
		if ( ! PodAI_Chat_Plugin::connected() || empty( $s['enabled'] ) || ! apply_filters( 'podai_chat_show_widget', true ) ) {
			return;
		}
		wp_enqueue_style( 'podai-chat', PODAI_CHAT_URL . 'assets/css/widget.css', array(), PODAI_CHAT_VERSION );
		wp_enqueue_script(
			'podai-chat',
			PODAI_CHAT_URL . 'assets/js/widget.js',
			array(),
			PODAI_CHAT_VERSION,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
		$lang = 'auto' !== $s['language'] ? $s['language'] : str_replace( '_', '-', get_locale() );
		wp_localize_script(
			'podai-chat',
			'PodAIChat',
			array(
				'api'         => array(
					'chat'        => esc_url_raw( rest_url( 'pod-ai/v1/chat' ) ),
					'config'      => esc_url_raw( rest_url( 'pod-ai/v1/config' ) ),
					'addItem'     => esc_url_raw( rest_url( 'wc/store/v1/cart/add-item' ) ),
					'applyCoupon' => esc_url_raw( rest_url( 'wc/store/v1/cart/apply-coupon' ) ),
				),
				'storeNonce'  => wp_create_nonce( 'wc_store_api' ),
				'checkoutUrl' => wc_get_checkout_url(),
				'cartUrl'     => wc_get_cart_url(),
				'shop'        => wp_strip_all_tags( get_bloginfo( 'name' ) ),
				'title'       => $s['title'],
				'color'       => $s['color'],
				'position'    => $s['position'],
				'greeting'    => $s['greeting'],
				'lang'        => $lang,
			)
		);
	}
}
