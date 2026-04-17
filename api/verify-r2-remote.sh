#!/bin/bash
# Log R2 files at specific positions (1, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5250, 5500, 5750, 6000, 6500, 7000)
# Usage: ./verify-r2-remote.sh

BUCKET_NAME=coldigom-assets
STORAGE_DIR=../storage

# Positions to log
POSITIONS=(1 500 1000 1500 2000 2500 3000 3500 4000 4500 5000 5250 5500 5750 6000 6500 7000)

echo ==========================================
echo R2 File Logger
echo ==========================================
echo Logging files at positions: ${POSITIONS[*]}
echo Bucket: $BUCKET_NAME
echo

# Check if storage directory exists
if [ ! -d $STORAGE_DIR ]; then
    echo Error: Storage directory does not exist
    exit 1
fi

count=0

while IFS= read -r file; do
    count=$((count + 1))
    
    # Check if current position is in our list
    for pos in "${POSITIONS[@]}"; do
        if [ $count -eq $pos ]; then
            # Extract path from storage/ to extension
            relpath=${file#./}
            relpath=${relpath#$STORAGE_DIR/}
            echo [$count] $relpath
            break
        fi
    done
done < <(find $STORAGE_DIR -type f ! -name .DS_Store | sort)

echo
echo ==========================================
echo Done. Total files: $count
echo ==========================================
