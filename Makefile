.PHONY: frontend-install frontend-build backend-test backend-docker-test compose-up compose-down

frontend-install:
	npm install --prefix frontend

frontend-build:
	npm run build --prefix frontend

backend-test:
	go test ./backend/...

backend-docker-test:
	docker run --rm -v "$$(pwd)/backend:/app" -w /app golang:1.25-alpine sh -c "go mod download && go test ./..."

compose-up:
	docker compose up --build

compose-down:
	docker compose down --remove-orphans
