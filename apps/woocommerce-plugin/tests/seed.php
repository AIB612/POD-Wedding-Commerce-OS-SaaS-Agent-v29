<?php
update_option( 'woocommerce_currency', 'CHF' );
update_option( 'woocommerce_default_country', 'CH:ZH' );
update_option( 'woocommerce_store_address', 'Teststrasse 1' );
update_option( 'woocommerce_store_city', 'Zürich' );
update_option( 'woocommerce_store_postcode', '8001' );
update_option( 'woocommerce_coming_soon', 'no' );
update_option( 'woocommerce_onboarding_profile', array( 'skipped' => true ) );
// pages
$ship = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Shipping', 'post_content' => 'We ship from Zurich within 2 business days. Delivery in Switzerland takes 1-3 business days, to the EU 4-7 business days. Customs fees for non-EU destinations are paid by the recipient.' ) );
$contact = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Contact', 'post_content' => 'Write to us at hello@alpine-gifts.test — we answer within one business day.' ) );
$refund = (int) get_option( 'woocommerce_refund_returns_page_id' );
if ( $refund ) { wp_update_post( array( 'ID' => $refund, 'post_status' => 'publish', 'post_content' => 'You can return unused items within 30 days of delivery for a full refund. Contact us with your order number, and we will send you a return label. Refunds are issued to the original payment method within 5 business days after we receive the item.' ) ); }
// shipping zones
foreach ( WC_Shipping_Zones::get_zones() as $z ) { WC_Shipping_Zones::delete_zone( $z['zone_id'] ); }
$z = new WC_Shipping_Zone(); $z->set_zone_name( 'Switzerland' ); $z->add_location( 'CH', 'country' ); $z->add_location( 'LI', 'country' ); $z->save();
$i = $z->add_shipping_method( 'flat_rate' ); $m = WC_Shipping_Zones::get_shipping_method( $i ); update_option( $m->get_instance_option_key(), array( 'title' => 'Swiss Post Priority', 'cost' => '7', 'tax_status' => 'none' ) );
$i = $z->add_shipping_method( 'free_shipping' ); $m = WC_Shipping_Zones::get_shipping_method( $i ); update_option( $m->get_instance_option_key(), array( 'title' => 'Free shipping', 'requires' => 'min_amount', 'min_amount' => '80' ) );
$z2 = new WC_Shipping_Zone(); $z2->set_zone_name( 'Europe' ); foreach ( array( 'DE', 'FR', 'IT', 'AT' ) as $c ) { $z2->add_location( $c, 'country' ); } $z2->save();
$i = $z2->add_shipping_method( 'flat_rate' ); $m = WC_Shipping_Zones::get_shipping_method( $i ); update_option( $m->get_instance_option_key(), array( 'title' => 'International', 'cost' => '15', 'tax_status' => 'none' ) );
// categories + products
function podai_cat( $n ) { $t = term_exists( $n, 'product_cat' ); if ( ! $t ) { $t = wp_insert_term( $n, 'product_cat' ); } return (int) $t['term_id']; }
function podai_img( $color ) { return 0; }
$items = array(
  array( 'Edelweiss Mug', 24, array( 'Mugs', 'Gifts' ), 'coffee,cup', 'Ceramic mug with a hand-drawn edelweiss, 350 ml.', 20 ),
  array( 'Alpine Wool Scarf', 49, array( 'Accessories', 'Gifts' ), 'women,winter,wool', 'Soft merino wool scarf, made in Switzerland.', 8 ),
  array( 'Swiss Chocolate Box', 18, array( 'Food', 'Gifts' ), 'chocolate,sweet', '24 pralines from a Zurich chocolatier.', 40 ),
  array( 'Matterhorn Poster', 35, array( 'Art' ), 'poster,print,mountain', 'A2 art print of the Matterhorn at sunrise.', 15 ),
  array( 'Cowbell Keyring', 9, array( 'Accessories', 'Gifts' ), 'souvenir,keyring', 'Mini brass cowbell keyring.', 100 ),
  array( 'Swiss Army Knife Classic', 29, array( 'Tools', 'Gifts' ), 'men,knife,outdoor', 'The classic pocket knife with 7 functions.', 25 ),
  array( 'Kids Plush Cow', 22, array( 'Kids', 'Gifts' ), 'kids,toy,plush', 'Cuddly plush cow for children 0+.', 12 ),
  array( 'Cuckoo Clock', 299, array( 'Home', 'Gifts' ), 'clock,wood', 'Hand-carved cuckoo clock.', 0 ),
);
$ids = array();
foreach ( $items as $it ) {
  $p = new WC_Product_Simple(); $p->set_name( $it[0] ); $p->set_regular_price( (string) $it[1] ); $p->set_status( 'publish' ); $p->set_short_description( $it[4] );
  $p->set_category_ids( array_map( 'podai_cat', $it[2] ) ); $p->set_manage_stock( true ); $p->set_stock_quantity( $it[5] ); $p->set_stock_status( $it[5] > 0 ? 'instock' : 'outofstock' );
  $p->save(); wp_set_object_terms( $p->get_id(), explode( ',', $it[3] ), 'product_tag' ); $ids[ $it[0] ] = $p->get_id();
}
// variable product (sizes)
$attr = new WC_Product_Attribute(); $attr->set_name( 'Size' ); $attr->set_options( array( 'M', 'L' ) ); $attr->set_visible( true ); $attr->set_variation( true );
$v = new WC_Product_Variable(); $v->set_name( 'Hiking Socks' ); $v->set_status( 'publish' ); $v->set_attributes( array( $attr ) ); $v->set_category_ids( array( podai_cat( 'Clothing' ) ) ); $v->set_short_description( 'Merino hiking socks.' ); $v->save();
foreach ( array( 'M' => 'instock', 'L' => 'outofstock' ) as $size => $st ) { $var = new WC_Product_Variation(); $var->set_parent_id( $v->get_id() ); $var->set_attributes( array( 'size' => $size ) ); $var->set_regular_price( '15' ); $var->set_stock_status( $st ); $var->save(); }
WC_Product_Variable::sync( $v->get_id() );
// draft product (must never appear)
$d = new WC_Product_Simple(); $d->set_name( 'Secret Draft Product' ); $d->set_regular_price( '10' ); $d->set_status( 'draft' ); $d->save();
// coupon
$c = new WC_Coupon(); $c->set_code( 'welcome10' ); $c->set_discount_type( 'percent' ); $c->set_amount( 10 ); $c->save();
// orders
$o = wc_create_order(); $o->add_product( wc_get_product( $ids['Edelweiss Mug'] ), 2 ); $o->set_billing_email( 'buyer@example.com' ); $o->set_billing_first_name( 'Test' ); $o->calculate_totals(); $o->set_status( 'completed' );
$o->update_meta_data( '_wc_shipment_tracking_items', array( array( 'tracking_provider' => 'swiss-post', 'custom_tracking_provider' => '', 'tracking_number' => '99.00.123456.78901234', 'custom_tracking_link' => '' ) ) ); $o->save();
$o2 = wc_create_order(); $o2->add_product( wc_get_product( $ids['Alpine Wool Scarf'] ), 1 ); $o2->set_billing_email( 'anna@example.com' ); $o2->calculate_totals(); $o2->set_status( 'processing' ); $o2->save();
update_option( 'podai_seed', array( 'orders' => array( $o->get_id(), $o2->get_id() ), 'shipping_page' => $ship, 'contact_page' => $contact ) );
echo wp_json_encode( array( 'orders' => array( $o->get_id(), $o2->get_id() ), 'ship' => $ship, 'contact' => $contact, 'products' => $ids ) );
