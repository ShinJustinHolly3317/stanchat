# Makefile for common Supabase operations
# 方便快速執行常用指令

.PHONY: help start stop reset migrate new-migration deploy-function test-local

help: ## 顯示所有可用指令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

start: ## 啟動本地 Supabase 環境
	supabase start

stop: ## 停止本地 Supabase 環境
	supabase stop

reset: ## 重置資料庫並執行所有 migrations
	supabase db reset

migrate: ## 建立新的 migration (使用: make migrate NAME=migration_name)
	@if [ -z "$(NAME)" ]; then \
		echo "請提供 migration 名稱: make migrate NAME=your_migration_name"; \
		exit 1; \
	fi
	supabase migration new $(NAME)

new-function: ## 建立新的 edge function 資料夾 (使用: make new-function NAME=function_name)
	@if [ -z "$(NAME)" ]; then \
		echo "請提供 function 名稱: make new-function NAME=your_function_name"; \
		exit 1; \
	fi
	@mkdir -p supabase/functions/$(NAME)
	@cp supabase/functions/hello-world/index.ts supabase/functions/$(NAME)/index.ts
	@echo "已建立 function: supabase/functions/$(NAME)/index.ts"

deploy-function: ## 部署 edge function (使用: make deploy-function NAME=function_name)
	@if [ -z "$(NAME)" ]; then \
		echo "請提供 function 名稱: make deploy-function NAME=your_function_name"; \
		exit 1; \
	fi
	supabase functions deploy $(NAME)

deploy-all: ## 部署所有 edge functions
	@for dir in supabase/functions/*/; do \
		if [ -f "$$dir/index.ts" ] || [ -f "$$dir/index.js" ]; then \
			func_name=$$(basename "$$dir"); \
			echo "Deploying function: $$func_name"; \
			supabase functions deploy "$$func_name" --no-verify-jwt || true; \
		fi \
	done

serve-function: ## 本地測試 edge function (使用: make serve-function NAME=function_name)
	@if [ -z "$(NAME)" ]; then \
		echo "請提供 function 名稱: make serve-function NAME=your_function_name"; \
		exit 1; \
	fi
	supabase functions serve $(NAME)

status: ## 顯示 Supabase 服務狀態
	supabase status

logs: ## 顯示 Supabase 日誌
	supabase logs
