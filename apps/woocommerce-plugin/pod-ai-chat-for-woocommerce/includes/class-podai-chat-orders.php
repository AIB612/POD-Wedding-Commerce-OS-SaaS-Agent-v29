<?php
/**
 * Order lookup for the chat (signed callback from the backend). Needs the order number AND the billing e-mail;
 * returns only status, items, total and tracking — never addresses, phone numbers or payment details.
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Orders.
 */
class PodAI_Chat_Orders {

	/**
	 * Carrier name → tracking URL pattern (%s = number).
	 *
	 * @var array
	 */
	const CARRIERS = array(
		'swiss post'    => 'https://service.post.ch/ekp-web/ui/entry/shipping/1/?formattedParcelCodes=%s',
		'post ch'       => 'https://service.post.ch/ekp-web/ui/entry/shipping/1/?formattedParcelCodes=%s',
		'dhl'           => 'https://www.dhl.com/global-en/home/tracking/tracking-parcel.html?tracking-id=%s',
		'deutsche post' => 'https://www.deutschepost.de/de/s/sendungsverfolgung.html?piececode=%s',
		'ups'           => 'https://www.ups.com/track?tracknum=%s',
		'fedex'         => 'https://www.fedex.com/fedextrack/?trknbr=%s',
		'usps'          => 'https://tools.usps.com/go/TrackConfirmAction?tLabels=%s',
		'dpd'           => 'https://tracking.dpd.de/status/en_US/parcel/%s',
		'gls'           => 'https://gls-group.com/track/%s',
		'la poste'      => 'https://www.laposte.fr/outils/suivre-vos-envois?code=%s',
		'colissimo'     => 'https://www.laposte.fr/outils/suivre-vos-envois?code=%s',
		'poste italiane' => 'https://www.poste.it/cerca/index.html#/risultati-spedizioni/%s',
		'royal mail'    => 'https://www.royalmail.com/track-your-item#/tracking-results/%s',
		'yunexpress'    => 'https://www.yuntrack.com/parcelTracking?id=%s',
		'4px'           => 'https://track.4px.com/#/result/0/%s',
	);

	/**
	 * Find an order by the number the customer sees (ID or a sequential-number plugin's meta).
	 *
	 * @param string $number Order number.
	 * @return WC_Order|null
	 */
	public static function find( $number ) {
		$number = ltrim( trim( (string) $number ), '#' );
		if ( '' === $number || ! preg_match( '/^[A-Za-z0-9-]{1,30}$/', $number ) ) {
			return null;
		}
		$order = ctype_digit( $number ) ? wc_get_order( (int) $number ) : null;
		if ( $order instanceof WC_Order && (string) $order->get_order_number() === $number ) {
			return $order;
		}
		foreach ( array( '_order_number', '_order_number_formatted', '_alg_wc_custom_order_number' ) as $key ) {
			$found = wc_get_orders(
				array(
					'limit'      => 1,
					'meta_key'   => $key, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
					'meta_value' => $number, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				)
			);
			if ( $found ) {
				return $found[0];
			}
		}
		$order = apply_filters( 'podai_chat_find_order', null, $number );
		return $order instanceof WC_Order ? $order : null;
	}

	/**
	 * Tracking numbers from common plugins' order meta (WooCommerce Shipment Tracking, Advanced Shipment Tracking,
	 * YITH Order Tracking, generic _tracking_number), filterable via podai_chat_order_tracking.
	 *
	 * @param WC_Order $order Order.
	 * @return array
	 */
	public static function tracking( $order ) {
		$out   = array();
		$items = $order->get_meta( '_wc_shipment_tracking_items' );
		if ( is_array( $items ) ) {
			foreach ( $items as $t ) {
				$company = ! empty( $t['custom_tracking_provider'] ) ? $t['custom_tracking_provider'] : ( isset( $t['tracking_provider'] ) ? $t['tracking_provider'] : '' );
				$out[]   = array(
					'company' => $company,
					'number'  => isset( $t['tracking_number'] ) ? $t['tracking_number'] : '',
					'url'     => ! empty( $t['custom_tracking_link'] ) ? $t['custom_tracking_link'] : '',
				);
			}
		}
		if ( $order->get_meta( 'ywot_tracking_code' ) ) {
			$out[] = array(
				'company' => (string) $order->get_meta( 'ywot_carrier_name' ),
				'number'  => (string) $order->get_meta( 'ywot_tracking_code' ),
				'url'     => (string) $order->get_meta( 'ywot_carrier_url' ),
			);
		}
		foreach ( array( '_tracking_number', 'tracking_number', '_podai_tracking_number' ) as $key ) {
			$n = (string) $order->get_meta( $key );
			if ( '' !== $n ) {
				$out[] = array(
					'company' => (string) ( $order->get_meta( '_tracking_provider' ) ? $order->get_meta( '_tracking_provider' ) : $order->get_meta( 'tracking_provider' ) ),
					'number'  => $n,
					'url'     => (string) ( $order->get_meta( '_tracking_url' ) ? $order->get_meta( '_tracking_url' ) : $order->get_meta( 'tracking_url' ) ),
				);
				break;
			}
		}
		$seen = array();
		$res  = array();
		foreach ( $out as $t ) {
			$num = trim( (string) $t['number'] );
			if ( '' === $num || isset( $seen[ $num ] ) ) {
				continue;
			}
			$seen[ $num ] = true;
			$company      = trim( (string) $t['company'] );
			if ( preg_match( '/^[a-z0-9_-]+$/', $company ) ) {
				$company = ucwords( str_replace( array( '-', '_' ), ' ', $company ) ); // "swiss-post" → "Swiss Post".
			}
			$url          = esc_url_raw( (string) $t['url'] );
			if ( '' === $url ) {
				$key = strtolower( str_replace( array( '-', '_' ), ' ', $company ) );
				foreach ( self::CARRIERS as $name => $pattern ) {
					if ( '' !== $key && false !== strpos( $key, $name ) ) {
						$url = sprintf( $pattern, rawurlencode( $num ) );
						break;
					}
				}
			}
			$res[] = array(
				'company' => $company,
				'number'  => $num,
				'url'     => $url,
			);
		}
		return apply_filters( 'podai_chat_order_tracking', array_slice( $res, 0, 3 ), $order );
	}

	/**
	 * Lookup for the chat. Same answer for "no such order" and "wrong e-mail".
	 *
	 * @param string $number Order number.
	 * @param string $email  E-mail given by the shopper.
	 * @return array
	 */
	public static function lookup( $number, $email ) {
		$order = self::find( $number );
		$email = strtolower( trim( (string) $email ) );
		if ( ! $order || '' === $email || ! hash_equals( strtolower( trim( (string) $order->get_billing_email() ) ), $email ) ) {
			return array(
				'ok'    => false,
				'error' => 'not_found',
			);
		}
		$status = $order->get_status();
		$ful    = array(
			'completed'  => 'FULFILLED',
			'processing' => 'IN_PROGRESS',
			'on-hold'    => 'ON_HOLD',
			'pending'    => 'UNFULFILLED',
			'refunded'   => 'REFUNDED',
			'failed'     => 'FAILED',
			'cancelled'  => 'CANCELLED',
		);
		$items  = array();
		foreach ( $order->get_items() as $item ) {
			$items[] = array(
				'title'    => wp_strip_all_tags( $item->get_name() ),
				'quantity' => (int) $item->get_quantity(),
			);
		}
		return array(
			'ok'    => true,
			'order' => array(
				'name'        => '#' . $order->get_order_number(),
				'created_at'  => $order->get_date_created() ? $order->get_date_created()->date( 'c' ) : '',
				'cancelled'   => 'cancelled' === $status,
				'payment'     => 'refunded' === $status ? 'REFUNDED' : ( $order->is_paid() ? 'PAID' : 'PENDING' ),
				'fulfillment' => isset( $ful[ $status ] ) ? $ful[ $status ] : strtoupper( $status ),
				'total'       => wc_format_decimal( $order->get_total(), 2 ),
				'currency'    => $order->get_currency(),
				'items'       => array_slice( $items, 0, 10 ),
				'tracking'    => self::tracking( $order ),
			),
		);
	}

	/**
	 * Coupon check (read-only; codes are never listed).
	 *
	 * @param string $code Code.
	 * @return array
	 */
	public static function coupon( $code ) {
		$code = wc_format_coupon_code( $code );
		$id   = wc_get_coupon_id_by_code( $code );
		if ( ! $id ) {
			return array(
				'ok'    => true,
				'valid' => false,
			);
		}
		$c       = new WC_Coupon( $id );
		$expires = $c->get_date_expires();
		$limit   = $c->get_usage_limit();
		$valid   = 'publish' === get_post_status( $id ) && ( ! $expires || $expires->getTimestamp() > time() ) && ( ! $limit || $c->get_usage_count() < $limit );
		$amount  = $c->get_amount();
		$summary = 'percent' === $c->get_discount_type() ? $amount . '%' : wp_strip_all_tags( wc_price( $amount ) );
		return array(
			'ok'      => true,
			'valid'   => $valid,
			'summary' => $valid ? $summary : '',
			'ends_at' => $expires ? $expires->date( 'c' ) : null,
		);
	}
}
