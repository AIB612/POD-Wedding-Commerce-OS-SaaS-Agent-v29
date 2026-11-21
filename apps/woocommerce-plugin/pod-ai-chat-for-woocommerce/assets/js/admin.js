(function () {
	document.addEventListener('DOMContentLoaded', function () {
		var form = document.querySelector('form.podai-disconnect');
		if (!form) {
			return;
		}
		form.addEventListener('submit', function (e) {
			var msg = form.getAttribute('data-podai-confirm');
			if (msg && !window.confirm(msg)) {
				e.preventDefault();
			}
		});
	});
})();
