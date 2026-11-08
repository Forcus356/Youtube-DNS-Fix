NODE ?= node

.PHONY: test check

test:
	$(NODE) test/pac.test.js

check:
	$(NODE) --check background.js
	$(NODE) --check popup.js
	$(NODE) --check pac.js
	$(NODE) --check test/pac.test.js
