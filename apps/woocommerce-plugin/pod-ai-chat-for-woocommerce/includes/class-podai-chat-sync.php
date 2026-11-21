<?php
/**
 * Product sync: push on save / stock change / delete, full sync daily (WP-cron) and on demand, in batches of 50.
 * Public catalogue data is sent (title, price, currency, image, in-stock status, URL, categories, tags, short text, variations).
 * SKUs and exact stock quantities are sent only when the admin opts in (sync_sku_stock).
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

/**
 * Product sync.
 */
class PodAI_Chat_Sync {

	const BATCH = 50;

	/**
	 * Product ids changed during this request (pushed once at shutdown).
	 *
	 * @var int[]
	 */
	private static $dirty = array();

	/**
	 * Hooks.
	 */
	public static function init() {
		add_action( 'woocommerce_update_product', array( __CLASS__, 'mark' ) );
		add_action( 'woocommerce_new_product', array( __CLASS__, 'mark' ) );
		add_action( 'woocommerce_product_set_stock_status', array( __CLASS__, 'mark' ) );
		add_action( 'woocommerce_variation_set_stock_status', array( __CLASS__, 'mark_variation' ) );
		add_action( 'woocommerce_update_product_variation', array( __CLASS__, 'mark_variation' ) );
		add_action( 'before_delete_post', array( __CLASS__, 'deleted' ) );
		add_action( 'wp_trash_post', array( __CLASS__, 'deleted' ) );
		add_action( 'shutdown', array( __CLASS__, 'flush' ) );
	}

	/**
	 * Remember a changed product.
	 *
	 * @param int $id Product id.
	 */
	public static function mark( $id ) {
		self::$dirty[ (int) $id ] = true;
	}

	/**
	 * Variation changed → its parent.
	 *
	 * @param int $id Variation id.
	 */
	public static function mark_variation( $id ) {
		$parent = wp_get_post_parent_id( (int) $id );
		if ( $parent ) {
			self::mark( $parent );
		}
	}

	/**
	 * Product deleted / trashed → remove from the catalogue.
	 *
	 * @param int $id Post id.
	 */
	public static function deleted( $id ) {
		if ( 'product' === get_post_type( $id ) && PodAI_Chat_Plugin::connected() ) {
			unset( self::$dirty[ (int) $id ] );
			PodAI_Chat_Client::request( 'POST', 'products/delete', array( 'ids' => array( (string) (int) $id ) ), 5 );
		}
	}

	/**
	 * Push changed products at the end of the request.
	 */
	public static function flush() {
		if ( ! self::$dirty || ! PodAI_Chat_Plugin::connected() ) {
			return;
		}
		$rows = array();
		$gone = array();
		foreach ( array_keys( self::$dirty ) as $id ) {
			$p   = wc_get_product( $id );
			$row = $p ? self::row( $p ) : null;
			if ( $row ) {
				$rows[] = $row;
			} else {
				$gone[] = (string) $id;
			}
		}
		self::$dirty = array();
		if ( $rows ) {
			PodAI_Chat_Client::request( 'POST', 'products/sync', array( 'products' => $rows ), 5 );
		}
		if ( $gone ) {
			PodAI_Chat_Client::request( 'POST', 'products/delete', array( 'ids' => $gone ), 5 );
		}
	}

	/**
	 * Product → sync row; null when it must not be in the chat (draft, private, hidden from the catalogue).
	 *
	 * @param WC_Product $p Product.
	 * @return array|null
	 */
	public static function row( $p ) {
		if ( ! $p || 'publish' !== $p->get_status() || 'hidden' === $p->get_catalog_visibility() || '' !== (string) $p->get_post_password() ) {
			return null;
		}
		$img        = $p->get_image_id() ? wp_get_attachment_image_url( $p->get_image_id(), 'woocommerce_thumbnail' ) : '';
		$terms      = function ( $tax ) use ( $p ) {
			$t = get_the_terms( $p->get_id(), $tax );
			return is_array( $t ) ? array_values( wp_list_pluck( $t, 'name' ) ) : array();
		};
		$variations = array();
		$max        = (float) $p->get_price();
		if ( $p->is_type( 'variable' ) ) {
			foreach ( array_slice( $p->get_children(), 0, 20 ) as $vid ) {
				$v = wc_get_product( $vid );
				if ( ! $v || ! $v->variation_is_visible() ) {
					continue;
				}
				$variations[] = array(
					'id'       => (string) $vid,
					'title'    => wc_get_formatted_variation( $v, true, true, false ),
					'price'    => (float) $v->get_price(),
					'in_stock' => $v->is_in_stock(),
				);
				$max          = max( $max, (float) $v->get_price() );
			}
		}
		$row = array(
			'id'                => (string) $p->get_id(),
			'name'              => wp_strip_all_tags( $p->get_name() ),
			'price'             => '' === $p->get_price() ? null : (float) $p->get_price(),
			'regular_price'     => '' === $p->get_regular_price() ? null : (float) $p->get_regular_price(),
			'max_price'         => $max,
			'currency'          => get_woocommerce_currency(),
			'image'             => $img ? $img : '',
			'url'               => get_permalink( $p->get_id() ),
			'in_stock'          => $p->is_in_stock(),
			'type'              => $p->get_type(),
			'purchasable'       => $p->is_purchasable(),
			'on_sale'           => $p->is_on_sale(),
			'categories'        => $terms( 'product_cat' ),
			'tags'              => $terms( 'product_tag' ),
			'short_description' => wp_strip_all_tags( $p->get_short_description() ? $p->get_short_description() : wp_trim_words( $p->get_description(), 40 ) ),
			'variations'        => $variations,
			'updated_at'        => $p->get_date_modified() ? $p->get_date_modified()->date( 'c' ) : '',
		);
		// SKU and exact quantities are opt-in (off by default). Always send null when off so a previous opt-in can be cleared.
		if ( ! empty( PodAI_Chat_Plugin::settings()['sync_sku_stock'] ) ) {
			$row['stock_quantity'] = $p->managing_stock() ? (int) $p->get_stock_quantity() : null;
			$row['sku']            = $p->get_sku();
		} else {
			$row['stock_quantity'] = null;
			$row['sku']            = '';
		}
		return $row;
	}

	/**
	 * Full sync (cron + "Sync now"): all published products in batches; the backend drops products that disappeared.
	 *
	 * @return array|WP_Error Summary.
	 */
	public static function full_sync() {
		if ( ! PodAI_Chat_Plugin::connected() ) {
			return new WP_Error( 'podai_not_connected', __( 'Pod.AI is not connected yet.', 'pod-ai-chat-for-woocommerce' ) );
		}
		PodAI_Chat_Store::push();
		$sync_id = 's' . time();
		$page    = 1;
		$sent    = 0;
		$last    = array();
		do {
			$ids  = wc_get_products(
				array(
					'status'  => 'publish',
					'limit'   => self::BATCH,
					'page'    => $page,
					'return'  => 'ids',
					'orderby' => 'ID',
					'order'   => 'ASC',
				)
			);
			$rows = array();
			foreach ( $ids as $id ) {
				$row = self::row( wc_get_product( $id ) );
				if ( $row ) {
					$rows[] = $row;
				}
			}
			$done = count( $ids ) < self::BATCH;
			$last = PodAI_Chat_Client::request(
				'POST',
				'products/sync',
				array(
					'mode'     => 'full',
					'sync_id'  => $sync_id,
					'done'     => $done,
					'products' => $rows,
				),
				30
			);
			if ( is_wp_error( $last ) ) {
				PodAI_Chat_Plugin::update( array( 'last_sync_info' => 'error: ' . $last->get_error_message() ) );
				return $last;
			}
			$sent += count( $rows );
			++$page;
		} while ( ! $done && $page < 400 );
		PodAI_Chat_Plugin::update(
			array(
				'last_sync'      => current_time( 'mysql' ),
				'last_sync_info' => sprintf( '%d / %d', $sent, isset( $last['total'] ) ? (int) $last['total'] : $sent ),
			)
		);
		return array(
			'sent'  => $sent,
			'total' => isset( $last['total'] ) ? (int) $last['total'] : $sent,
		);
	}
}
