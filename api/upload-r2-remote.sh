#!/bin/bash
set -e

upload_r2_remote() {
    local BUCKET="coldigom-assets"
    local STORAGE_DIR="../storage"
    local SKIP_COUNT=${1:-6070}

    echo "=========================================="
    echo "R2 Upload Script (Remote)"
    echo "=========================================="
    echo "Starting R2 upload for files in $STORAGE_DIR..."
    echo "Bucket: $BUCKET"
    echo "Skipping first $SKIP_COUNT files (already uploaded)"
    echo ""

    if [ ! -d "$STORAGE_DIR" ]; then
        echo "Error: Storage directory '$STORAGE_DIR' does not exist!"
        echo "Please create the directory and add files to upload."
        exit 1
    fi

    local count=0
    local skipped=0
    local uploaded=0
    local failed=0
    local total
    total=$(find "$STORAGE_DIR" -type f ! -name ".DS_Store" | wc -l | tr -d ' ')
    echo "Total files in storage: $total"
    echo ""

    while IFS= read -r file; do
        local relative_path="${file#./}"
        local key="storage/${relative_path#$STORAGE_DIR/}"
        
        count=$((count + 1))
        
        if [ $count -le $SKIP_COUNT ]; then
            skipped=$((skipped + 1))
            if [ $((skipped % 500)) -eq 0 ]; then
                echo "[$count/$total] Skipped (already uploaded): $key"
            fi
            continue
        fi
        
        local result
        result=$(wrangler r2 object put "$BUCKET/$key" -f="$file" --remote 2>&1)
        
        if echo "$result" | grep -q "Upload complete\|Created object\|uploaded"; then
            uploaded=$((uploaded + 1))
            echo "[$count/$total] Uploaded: $key"
        else
            failed=$((failed + 1))
            echo "[$count/$total] FAILED: $key"
            echo "  Error: $result" | head -5
        fi
    done < <(find "$STORAGE_DIR" -type f ! -name ".DS_Store")

    echo ""
    echo "Upload complete!"
    echo "Uploaded: $uploaded"
    echo "Skipped: $skipped"
    echo "Failed: $failed"
}

upload_r2_remote