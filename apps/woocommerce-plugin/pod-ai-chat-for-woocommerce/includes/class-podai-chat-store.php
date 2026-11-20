<?php
/**
 * Store facts (name, currency, policies, shipping zones, visible coupon) and chat settings pushed to the backend.
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Store facts.
 */
class PodAI_Chat_Store {

	/**
	 * Page → policy row.
	 *
	 * @param int    $page_id Page.
	 * @param string $type    Policy type.
	 * @return array|null
	 */
	private static function page_policy( $page_id, $type ) {
		$page = $page_id ? get_post( (int) $page_id ) : null;
		if ( ! $page || 'publish' !== $page->post_status ) {
			return null;
		}
		$text = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( strip_shortcodes( $page->post_content ) ) ) );
		if ( '' === $text ) {
			return null;
		}
		return array(
			'type'  => $type,
			'title' => get_the_title( $page ),
			'text'  => mb_substr( $text, 0, 1500 ),
			'url'   => get_permalink( $page ),
		);
	}

	/**
	 * Shipping zones with flat-rate / free-shipping costs.
	 *
	 * @return array
	 */
	public static function shipping() {
		if ( ! class_exists( 'WC_Shipping_Zones' ) ) {
			return array();
		}
		$out        = array();
		$currency   = get_woocommerce_currency();
		$continents = WC()->countries->get_continents();
		$zones      = WC_Shipping_Zones::get_zones();
		$zones[]    = array( 'zone_id' => 0 );
		foreach ( $zones as $z ) {
			$zone      = new WC_Shipping_Zone( (int) $z['zone_id'] );
			$countries = array();
			foreach ( $zone->get_zone_locations() as $loc ) {
				if ( 'country' === $loc->type ) {
					$countries[] = $loc->code;
				} elseif ( 'state' === $loc->type ) {
					$countries[] = strtok( $loc->code, ':' );
				} elseif ( 'continent' === $loc->type && isset( $continents[ $loc->code ]['countries'] ) ) {
					$countries = array_merge( $countries, $continents[ $loc->code ]['countries'] );
				}
			}
			$methods = array();
			foreach ( $zone->get_shipping_methods( true ) as $m ) {
				$cost = null;
				$min  = null;
				if ( 'flat_rate' === $m->id ) {
					$raw  = (string) $m->get_option( 'cost' );
					$cost = is_numeric( $raw ) ? (float) $raw : null;
				} elseif ( 'free_shipping' === $m->id ) {
					$cost = 0.0;
					$req  = (string) $m->get_option( 'requires' );
					$min  = in_array( $req, array( 'min_amount', 'either', 'both' ), true ) ? (float) $m->get_option( 'min_amount' ) : null;
				} elseif ( 'local_pickup' === $m->id || 'pickup_location' === $m->id ) {
					$raw  = (string) $m->get_option( 'cost' );
					$cost = is_numeric( $raw ) ? (float) $raw : 0.0;
				}
				$methods[] = array(
					'name'       => $m->get_title(),
					'cost'       => $cost,
					'min_amount' => $min,
					'currency'   => $currency,
				);
			}
			if ( ! $methods ) {
				continue;
			}
			$out[] = array(
				'name'          => 0 === (int) $z['zone_id'] ? 'Rest of world' : $zone->get_zone_name(),
				'rest_of_world' => 0 === (int) $z['zone_id'],
				'countries'     => array_values( array_unique( $countries ) ),
				'methods'       => $methods,
			);
		}
		return $out;
	}

	/**
	 * FAQ textarea → rows. Blocks separated by a blank line; first line = question, rest = answer.
	 *
	 * @param string $text Text.
	 * @return array
	 */
	public static function parse_faq( $text ) {
		$rows = array();
		foreach ( preg_split( "/\R\s*\R/", trim( (string) $text ) ) as $block ) {
			$lines = preg_split( '/\R/', trim( $block ) );
			if ( count( $lines ) < 2 ) {
				continue;
			}
			$q      = trim( preg_replace( '/^(q|frage|question|domanda|问)\s*[:：]\s*/iu', '', array_shift( $lines ) ) );
			$a      = trim( preg_replace( '/^(a|antwort|answer|réponse|risposta|答)\s*[:：]\s*/iu', '', implode( ' ', $lines ) ) );
			$rows[] = array(
				'question' => $q,
				'answer'   => $a,
				'lang'     => self::lang(),
			);
		}
		return array_slice( $rows, 0, 200 );
	}

	/**
	 * Store language (en|de|fr|it|zh).
	 *
	 * @return string
	 */
	public static function lang() {
		$l = substr( get_locale(), 0, 2 );
		return in_array( $l, array( 'en', 'de', 'fr', 'it', 'zh' ), true ) ? $l : 'en';
	}

	/**
	 * Full payload for POST /store.
	 *
	 * @return array
	 */
	public static function payload() {
		$s        = PodAI_Chat_Plugin::settings();
		$policies = array_filter(
			array(
				self::page_policy( get_option( 'woocommerce_refund_returns_page_id' ), 'REFUND_POLICY' ),
				self::page_policy( $s['shipping_page'], 'SHIPPING_POLICY' ),
				self::page_policy( $s['contact_page'], 'CONTACT_INFORMATION' ),
				self::page_policy( wc_terms_and_conditions_page_id(), 'TERMS_OF_SERVICE' ),
				self::page_policy( get_option( 'wp_page_for_privacy_policy' ), 'PRIVACY_POLICY' ),
			)
		);
		$lang     = self::lang();
		$greeting = array();
		if ( '' !== trim( $s['greeting'] ) ) {
			$greeting[ $lang ] = $s['greeting'];
		}
		return array(
			'plugin_version' => PODAI_CHAT_VERSION,
			'store'    => array(
				'name'           => wp_strip_all_tags( get_bloginfo( 'name' ) ),
				'email'          => get_option( 'woocommerce_email_from_address', get_option( 'admin_email' ) ),
				'currency'       => get_woocommerce_currency(),
				'taxes_included' => 'yes' === get_option( 'woocommerce_prices_include_tax' ),
				'url'            => home_url( '/' ),
				'checkout_url'   => wc_get_checkout_url(),
				'cart_url'       => wc_get_cart_url(),
				'policies'       => array_values( $policies ),
				'shipping'       => self::shipping(),
				'promo'          => '' !== $s['promo_code'] ? array(
					'code'    => $s['promo_code'],
					'summary' => $s['promo_summary'],
				) : null,
			),
			'settings' => array(
				'enabled'           => (bool) $s['enabled'],
				'support_email'     => $s['ticket_email'] ? $s['ticket_email'] : get_option( 'admin_email' ),
				'human_reply_hours' => (int) $s['reply_hours'],
				'greeting'          => $greeting,
				'widget'            => array(
					'color'    => $s['color'],
					'position' => $s['position'],
					'language' => $s['language'],
					'title'    => $s['title'],
				),
				'custom_faq'        => self::parse_faq( $s['faq'] ),
				'agent_api'         => ! empty( $s['agent_api'] ),
			),
		);
	}

	/**
	 * Push facts + settings.
	 *
	 * @return array|WP_Error
	 */
	public static function push() {
		return PodAI_Chat_Client::request( 'POST', 'store', self::payload() );
	}
}
