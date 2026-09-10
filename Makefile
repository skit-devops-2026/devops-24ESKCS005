# Every team fills in the commands for their own stack.
# The CI pipeline calls these targets, so the names must not change.
#
# Stack: Node.js / Express / MongoDB

.PHONY: install test build run docker-build docker-up

install:
	npm install

test:
	@echo "TODO: run the test suite" && exit 1

build:
	@echo "No build step required for Node.js application"

run:
	npm start

# Needed from M4 onwards
docker-build:
	@echo "TODO: docker build for frontend and backend" && exit 1

docker-up:
	docker compose up --build
