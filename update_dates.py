import json
import os
from datetime import datetime, timedelta

def update_dates_in_folder(folder_path, start_date_str, is_summer):
    """
    폴더 내의 모든 청크 파일에서 날짜를 업데이트
    """
    start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
    
    # index.json 파일들 찾기
    index_file = os.path.join(folder_path, 'index.json')
    if not os.path.exists(index_file):
        print(f"  ⚠ index.json 파일이 없습니다: {folder_path}")
        return
    
    # 메타데이터 읽기
    with open(index_file, 'r', encoding='utf-8') as f:
        metadata = json.load(f)
    
    num_chunks = metadata.get('numChunks', 0)
    chunk_size = metadata.get('chunkSize', 1440)
    
    print(f"  처리할 청크 수: {num_chunks}")
    
    global_minute = 0
    
    # 각 청크 파일 처리
    for chunk_idx in range(num_chunks):
        chunk_file = os.path.join(folder_path, f'chunk-{chunk_idx}.json')
        
        if not os.path.exists(chunk_file):
            continue
        
        # 청크 파일 읽기
        with open(chunk_file, 'r', encoding='utf-8') as f:
            chunk_data = json.load(f)
        
        # 각 데이터 포인트의 시간 업데이트
        for data_point in chunk_data.get('data', []):
            current_datetime = start_date + timedelta(minutes=global_minute)
            data_point['time'] = current_datetime.strftime('%Y-%m-%d %H:%M:%S')
            global_minute += 1
        
        # 청크 파일 저장
        with open(chunk_file, 'w', encoding='utf-8') as f:
            json.dump(chunk_data, f, ensure_ascii=False, indent=2)
        
        if (chunk_idx + 1) % 10 == 0 or (chunk_idx + 1) == num_chunks:
            progress = (chunk_idx + 1) / num_chunks * 100
            print(f"  진행: {chunk_idx + 1}/{num_chunks} ({progress:.1f}%)")
    
    # 메타데이터 업데이트
    first_chunk_file = os.path.join(folder_path, 'chunk-0.json')
    last_chunk_file = os.path.join(folder_path, f'chunk-{num_chunks-1}.json')
    
    if os.path.exists(first_chunk_file):
        with open(first_chunk_file, 'r', encoding='utf-8') as f:
            first_chunk = json.load(f)
            if first_chunk['data']:
                metadata['startTime'] = first_chunk['data'][0]['time']
    
    if os.path.exists(last_chunk_file):
        with open(last_chunk_file, 'r', encoding='utf-8') as f:
            last_chunk = json.load(f)
            if last_chunk['data']:
                metadata['endTime'] = last_chunk['data'][-1]['time']
    
    metadata['season'] = 'summer' if is_summer else 'winter'
    metadata['startDate'] = start_date_str
    
    # 메타데이터 저장
    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    
    print(f"  ✓ 완료!")


# 폴더와 시작 날짜 매핑
folders = {
    'ref-summer': ('2025-08-01', True),
    'ref-winter': ('2025-01-01', False),
    'case1-plus-summer': ('2025-08-01', True),
    'case1-plus-winter': ('2025-01-01', False),
    'case1-summer': ('2025-08-01', True),
    'case1-winter': ('2025-01-01', False),
    'case2-plus-summer': ('2025-08-01', True),
    'case2-plus-winter': ('2025-01-01', False),
    'case2-summer': ('2025-08-01', True),
    'case2-winter': ('2025-01-01', False),
    'case3-plus-summer': ('2025-08-01', True),
    'case3-plus-winter': ('2025-01-01', False),
    'case3-summer': ('2025-08-01', True),
    'case3-winter': ('2025-01-01', False),
    'case4-plus-summer': ('2025-08-01', True),
    'case4-plus-winter': ('2025-01-01', False),
    'case4-summer': ('2025-08-01', True),
    'case4-winter': ('2025-01-01', False),
}

if __name__ == '__main__':
    base_dir = './public/data/simulation'
    
    print("=" * 60)
    print("날짜 업데이트 시작")
    print("=" * 60)
    
    for folder_name, (start_date, is_summer) in folders.items():
        folder_path = os.path.join(base_dir, folder_name)
        
        if not os.path.exists(folder_path):
            print(f"⚠ 폴더가 없습니다: {folder_name}")
            continue
        
        season_text = '여름 (8월~9월)' if is_summer else '겨울 (1월~2월)'
        print(f"\n처리 중: {folder_name} - {season_text}")
        print(f"  시작 날짜: {start_date}")
        
        try:
            update_dates_in_folder(folder_path, start_date, is_summer)
        except Exception as e:
            print(f"  ✗ 오류 발생: {e}")
            import traceback
            traceback.print_exc()
    
    print("\n" + "=" * 60)
    print("모든 처리 완료!")
    print("=" * 60)

