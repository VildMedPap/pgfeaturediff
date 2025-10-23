.PHONY: help dev build scrape scrape-local clean stop

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Start the frontend development server
	@docker build -t pgfeaturediff-frontend ./frontend
	@docker run --rm -it \
		-p 5173:5173 \
		-v $(PWD)/frontend:/app \
		-v /app/node_modules \
		--name pgfeaturediff-frontend \
		pgfeaturediff-frontend

build: ## Build the frontend for production
	@cd frontend && npm run build

scrape: ## Scrape PostgreSQL Feature Matrix with Python 3.14
	@uv run scraper/scraper.py

stop: ## Stop the running frontend container
	@docker stop pgfeaturediff-frontend 2>/dev/null || true

clean: ## Clean up Docker images and build artifacts
	@docker rmi pgfeaturediff-frontend 2>/dev/null || true
	@rm -rf frontend/dist
	@echo "Cleaned up!"
