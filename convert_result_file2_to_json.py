#!/usr/bin/env python3
"""
Result_file2의 텍스트 파일을 simulation2 폴더의 JSON 형식으로 변환하는 스크립트
"""

import os
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

# 설정
INPUT_DIR = "public/data/Result_file2"
OUTPUT_DIR = "public/data/simulation2"
CHUNK_SIZE = 1440  # 기존 simulation과 동일한 chunk 크기

def parse_scientific_notation(value):
    """과학적 표기법을 float로 변환"""
    # +5.0880000000000000E+03 형식
    return float(value.strip())

def format_date(month, day, hour):
    """Month, Day, Hour를 YYYY-MM-DD HH:MM:SS 형식으로 변환"""
    month_val = int(float(month))
    day_val = int(float(day))
    hour_float = float(hour)
    hour_int = int(hour_float)
    minute = int((hour_float - hour_int) * 60)
    second = int(((hour_float - hour_int) * 60 - minute) * 60)
    
    # 연도는 2025로 가정 (기존 데이터와 동일)
    year = 2025
    
    # 날짜 유효성 검사 및 자동 조정 (예: 7월 32일 -> 8월 1일)
    try:
        dt = datetime(year, month_val, day_val, hour_int, minute, second)
    except ValueError:
        # 잘못된 날짜인 경우 (예: 7월 32일), timedelta를 사용하여 조정
        # 기준 날짜를 해당 월의 1일로 설정하고 일수를 더함
        try:
            base_date = datetime(year, month_val, 1)
            dt = base_date + timedelta(days=day_val - 1)
            dt = dt.replace(hour=hour_int, minute=minute, second=second)
        except (ValueError, OverflowError):
            # 그래도 실패하면 기본값 사용
            dt = datetime(year, 1, 1, hour_int, minute, second)
    
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def parse_text_file(filepath):
    """텍스트 파일을 파싱하여 데이터 배열로 변환"""
    data = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
        # 헤더 라인 스킵 (첫 번째 라인)
        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue
            
            # 탭으로 구분
            parts = line.split('\t')
            if len(parts) < 11:
                continue
            
            try:
                time_val = parts[0].strip()
                oa = parse_scientific_notation(parts[1])
                t_air_test = parse_scientific_notation(parts[2])
                qsol = parse_scientific_notation(parts[3])
                sign = parse_scientific_notation(parts[4])
                q_sens_test = parse_scientific_notation(parts[5])
                t_h_set = parse_scientific_notation(parts[6])
                t_c_set = parse_scientific_notation(parts[7])
                month = parts[8].strip()
                day = parts[9].strip()
                hour = parts[10].strip()
                
                # 날짜 형식 변환
                time_str = format_date(month, day, hour)
                
                # JSON 형식으로 변환
                record = {
                    "time": time_str,
                    "T_external": oa,
                    "T_air_test": t_air_test,
                    "T_air_ref": t_air_test,  # 참조 데이터가 없으므로 test와 동일하게 설정
                    "Qsens_test": q_sens_test,
                    "Qsens_ref": q_sens_test,  # 참조 데이터가 없으므로 test와 동일하게 설정
                    "Tset": t_h_set if t_h_set != 0 else t_c_set  # 난방/냉방 설정온도
                }
                
                data.append(record)
            except (ValueError, IndexError) as e:
                print(f"Warning: Error parsing line: {line[:100]}... Error: {e}")
                continue
    
    return data

def split_into_chunks(data, chunk_size):
    """데이터를 chunk로 분할"""
    chunks = []
    for i in range(0, len(data), chunk_size):
        chunk = data[i:i + chunk_size]
        chunks.append(chunk)
    return chunks

def calculate_statistics(data):
    """데이터 통계 계산"""
    qsens_test_values = [d["Qsens_test"] for d in data]
    qsens_ref_values = [d["Qsens_ref"] for d in data]
    
    return {
        "minEnergyTest": min(qsens_test_values) if qsens_test_values else 0,
        "maxEnergyTest": max(qsens_test_values) if qsens_test_values else 0,
        "avgEnergyTest": sum(qsens_test_values) / len(qsens_test_values) if qsens_test_values else 0,
        "minEnergyRef": min(qsens_ref_values) if qsens_ref_values else 0,
        "maxEnergyRef": max(qsens_ref_values) if qsens_ref_values else 0,
        "avgEnergyRef": sum(qsens_ref_values) / len(qsens_ref_values) if qsens_ref_values else 0
    }

def convert_file(input_file, output_folder, case_name, season):
    """단일 파일을 변환"""
    print(f"Converting {input_file}...")
    
    # 데이터 파싱
    data = parse_text_file(input_file)
    if not data:
        print(f"Warning: No data found in {input_file}")
        return False
    
    # 폴더 생성
    os.makedirs(output_folder, exist_ok=True)
    
    # Chunk로 분할
    chunks = split_into_chunks(data, CHUNK_SIZE)
    
    # Chunk 파일 저장
    for i, chunk in enumerate(chunks):
        chunk_file = os.path.join(output_folder, f"chunk-{i}.json")
        chunk_data = {"data": chunk}
        with open(chunk_file, 'w', encoding='utf-8') as f:
            json.dump(chunk_data, f, indent=2, ensure_ascii=False)
    
    # 통계 계산
    stats = calculate_statistics(data)
    
    # index.json 생성
    start_time = data[0]["time"] if data else ""
    end_time = data[-1]["time"] if data else ""
    start_date = start_time.split()[0] if start_time else ""
    
    index_data = {
        "sheetName": case_name,
        "totalFrames": len(data),
        "numChunks": len(chunks),
        "chunkSize": CHUNK_SIZE,
        "startTime": start_time,
        "endTime": end_time,
        "minEnergyTest": stats["minEnergyTest"],
        "maxEnergyTest": stats["maxEnergyTest"],
        "avgEnergyTest": stats["avgEnergyTest"],
        "minEnergyRef": stats["minEnergyRef"],
        "maxEnergyRef": stats["maxEnergyRef"],
        "avgEnergyRef": stats["avgEnergyRef"],
        "season": season,
        "startDate": start_date
    }
    
    index_file = os.path.join(output_folder, "index.json")
    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)
    
    print(f"  Converted {len(data)} records into {len(chunks)} chunks")
    return True

def generate_manifest(output_dir):
    """manifest.json 파일 생성"""
    manifest = {"sheets": {}, "total_sheets": 0}
    
    # simulation2 폴더의 모든 케이스 폴더 찾기
    if os.path.exists(output_dir):
        for folder_name in sorted(os.listdir(output_dir)):
            folder_path = os.path.join(output_dir, folder_name)
            if os.path.isdir(folder_path):
                # case01-summer -> Case01_Summer 형식으로 변환
                if folder_name.startswith("case"):
                    parts = folder_name.split("-")
                    if len(parts) >= 2:
                        case_num = parts[0].replace("case", "")
                        season = parts[1]
                        
                        # Case01_Summer 형식으로 변환
                        case_name = f"Case{case_num.zfill(2)}_{season.capitalize()}"
                        manifest["sheets"][case_name] = folder_name
    
    manifest["total_sheets"] = len(manifest["sheets"])
    
    manifest_file = os.path.join(output_dir, "manifest.json")
    with open(manifest_file, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"\nManifest created with {manifest['total_sheets']} cases")
    return manifest

def main():
    """메인 함수"""
    input_path = Path(INPUT_DIR)
    output_path = Path(OUTPUT_DIR)
    
    if not input_path.exists():
        print(f"Error: Input directory not found: {INPUT_DIR}")
        return
    
    # 출력 디렉토리 생성
    output_path.mkdir(parents=True, exist_ok=True)
    
    # 모든 Case 파일 찾기
    case_files = sorted(input_path.glob("Case_*.txt"))
    
    if not case_files:
        print(f"Error: No case files found in {INPUT_DIR}")
        return
    
    print(f"Found {len(case_files)} case files")
    print("Starting conversion...\n")
    
    converted_count = 0
    
    for case_file in case_files:
        # 파일명 파싱: Case_01_Summer.txt -> case01-summer
        filename = case_file.stem
        match = re.match(r"Case_(\d+)_(Summer|Winter)", filename)
        
        if not match:
            print(f"Warning: Skipping invalid filename: {filename}")
            continue
        
        case_num = match.group(1)
        season = match.group(2).lower()
        
        # 출력 폴더명 생성
        output_folder_name = f"case{case_num.zfill(2)}-{season}"
        output_folder = output_path / output_folder_name
        
        # 케이스 이름 생성
        case_name = f"Case{case_num.zfill(2)}_{season.capitalize()}"
        
        # 변환 실행
        if convert_file(str(case_file), str(output_folder), case_name, season):
            converted_count += 1
    
    print(f"\nConversion complete! Converted {converted_count} files")
    
    # manifest.json 생성
    generate_manifest(str(output_path))
    
    print("\nDone!")

if __name__ == "__main__":
    main()

