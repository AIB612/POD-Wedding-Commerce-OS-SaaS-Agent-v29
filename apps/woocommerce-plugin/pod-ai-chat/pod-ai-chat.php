<?php
/**
 * Plugin Name:       Pod.AI Chat for WooCommerce
 * Plugin URI:        https://podai.swisspro.site/
 * Description:       AI shopping assistant for WooCommerce: answers from your store's own data (products, policies, shipping), recommends in-stock products and adds them to the cart, looks up orders and tracking, and turns "contact us" into tickets.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Requires Plugins:  woocommerce
 * Author:            Pod.AI
 * Author URI:        https://podai.swisspro.site/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       pod-ai-chat
 * Domain Path:       /languages
 * WC requires at least: 7.0
 * WC tested up to:   10.3
 *
 * @package PodAIChat
 */

defined( 'ABSPATH' ) || exit;

define( 'PODAI_CHAT_VERSION', '1.0.0' );
define( 'PODAI_CHAT_FILE', __FILE__ );
define( 'PODAI_CHAT_DIR', plugin_dir_path( __FILE__ ) );
define( 'PODAI_CHAT_URL', plugin_dir_url( __FILE__ ) );
if ( ! defined( 'PODAI_CHAT_BACKEND' ) ) {
	define( 'PODAI_CHAT_BACKEND', 'https://podai.swisspro.site' );
}

require_once PODAI_CHAT_DIR . 'includes/class-podai-chat-client.php';
require_once PODAI_CHAT_DIR . 'includes/class-podai-chat-store.php';
require_once PODAI_CHAT_DIR . 'includes/class-podai-chat-sync.php';
require_once PODAI_CHAT_DIR . 'includes/class-podai-chat-orders.php';
require_once PODAI_CHAT_DIR . 'includes/class-podai-chat-rest.php';
require_once PODAI_CHAT_DIR . 'includes/class-podai-chat-widget.php';
require_once PODAI_CHAT_DIR . 'includes/class-podai-chat-admin.php';
require_once PODAI_CHAT_DIR . 'includes/class-podai-chat-plugin.php';

register_activation_hook( __FILE__, array( 'PodAI_Chat_Plugin', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'PodAI_Chat_Plugin', 'deactivate' ) );

add_action( 'plugins_loaded', array( 'PodAI_Chat_Plugin', 'instance' ) );

// HPOS (custom order tables) compatible: orders are read only through wc_get_order() / wc_get_orders().
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
		}
	}
);
