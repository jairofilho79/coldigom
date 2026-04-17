#!/bin/bash
set -e

upload_r2_local() {
    local BUCKET="coldigom-assets"
    local STORAGE_DIR="storage"

    echo "Starting R2 upload for files in $STORAGE_DIR..."
    echo "Bucket: $BUCKET"
    echo ""

    echo "Fetching existing objects from R2..."
    local existing_objects
    existing_objects=$(npx wrangler r2 object list "$BUCKET" 2>/dev/null | grep -E '"key": "[^"]+' | sed 's/.*"key": "\([^"]*\)".*/\1/' || true)

    local temp_file
    temp_file=$(mktemp)
    echo "$existing_objects" > "$temp_file"

    local count=0
    local skipped=0
    local uploaded=0
    local failed=0
    local total
    total=$(find "$STORAGE_DIR" -type f ! -name ".DS_Store" | wc -l | tr -d ' ')
    echo "Total files in storage: $total"
    echo ""

    while IFS= read -r file; do
        local key="${file#./}"
        
        count=$((count + 1))
        
        if grep -q "^${key}$" "$temp_file" 2>/dev/null; then
            skipped=$((skipped + 1))
        else
            if npx wrangler r2 object put "$BUCKET/$key" --file="$file" 2>/dev/null; then
                uploaded=$((uploaded + 1))
                echo "[$count/$total] Uploaded: $key"
            else
                failed=$((failed + 1))
                echo "[$count/$total] Failed: $key"
            fi
        fi
    done < <(find "$STORAGE_DIR" -type f ! -name ".DS_Store")

    rm -f "$temp_file"

    echo ""
    echo "Upload complete!"
    echo "Uploaded: $uploaded"
    echo "Skipped (already exists): $skipped"
    echo "Failed: $failed"
}

upload_r2_local