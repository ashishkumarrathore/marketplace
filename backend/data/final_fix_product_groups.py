#!/usr/bin/env python3
"""
Final fix: Update product_groups in all catalog JSON files
Sets product_groups array for filtering
"""

import json
import sys

def fix_catalog(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Replace all empty product_groups with appropriate values
    content = content.replace('"product_groups": []', '"product_groups": ["TEMP"]')
    
    lines = content.split('\n')
    result = []
    
    for i, line in enumerate(lines):
        result.append(line)
        
        # When we find a platform_id, look back to fix the product_groups
        if '"platform_id":' in line and 'TEMP' in '\n'.join(lines[max(0, i-10):i]):
            # Extract platform_id
            import re
            match = re.search(r'"platform_id":\s*"([^"]+)"', line)
            if match:
                pid = match.group(1).lower()
                # Find and fix the TEMP in previous lines
                for j in range(len(result)-1, max(0, len(result)-15), -1):
                    if '"product_groups": ["TEMP"]' in result[j]:
                        if 'iphone_17_pro_max' in pid:
                            result[j] = result[j].replace('["TEMP"]', '["iphone_17_pro_max"]')
                        elif 'iphone_17_pro' in pid:
                            result[j] = result[j].replace('["TEMP"]', '["iphone_17_pro"]')
                        elif 'iphone_17' in pid:
                            result[j] = result[j].replace('["TEMP"]', '["iphone_17"]')
                        break
    
    updated_content = '\n'.join(result)
    
    with open(filepath, 'w') as f:
        f.write(updated_content)
    
    print(f"✅ Fixed {filepath}")

if __name__ == "__main__":
    base = "/Users/ashishr/Downloads/26Mar_data/RFI/backend/data"
    for part in [1, 2, 3]:
        fp = f"{base}/catalog_part{part}.json"
        fix_catalog(fp)
    print("\n✅ All catalog files updated with product_groups!")
