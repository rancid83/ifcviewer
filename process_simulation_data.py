import pandas as pd
import json
import os
from pathlib import Path

def process_excel_sheets_to_json(excel_file, output_base_dir, chunk_size=1440):
    """
    엑셀 파일의 모든 시트를 읽어서 JSON 청크 파일로 변환
    """
    # 엑셀 파일의 모든 시트명 가져오기
    xl_file = pd.ExcelFile(excel_file)
    sheet_names = xl_file.sheet_names
    
    print(f"발견된 시트 수: {len(sheet_names)}")
    print(f"시트 목록: {sheet_names}\n")
    
    # 시트명을 폴더명으로 변환하는 매핑
    sheet_to_folder = {}
    for sheet_name in sheet_names:
        # 시트명을 폴더명으로 정리 (공백, 특수문자 처리)
        folder_name = sheet_name.lower().replace(' ', '-').replace('_', '-').replace('+', '-plus').replace('−', '-minus')
        sheet_to_folder[sheet_name] = folder_name
    
    # 각 시트 처리
    for sheet_name in sheet_names:
        folder_name = sheet_to_folder[sheet_name]
        output_dir = os.path.join(output_base_dir, folder_name)
        
        print(f"처리 중: {sheet_name} -> {folder_name}/")
        
        try:
            # 시트 읽기
            df = pd.read_excel(excel_file, sheet_name=sheet_name)
            
            # 데이터 전처리
            process_sheet_data(df, output_dir, sheet_name, chunk_size)
            
        except Exception as e:
            print(f"  ✗ 오류 발생: {e}\n")
            continue
    
    print("\n✓ 모든 시트 처리 완료!")
    
    # 생성된 폴더 목록 저장
    manifest = {
        'sheets': sheet_to_folder,
        'total_sheets': len(sheet_names)
    }
    
    with open(os.path.join(output_base_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"매니페스트 파일 생성: {output_base_dir}/manifest.json")

def process_sheet_data(df, output_dir, sheet_name, chunk_size):
    """
    단일 시트 데이터를 청크 파일로 변환
    """
    # 시트명에서 시즌 결정 (Summer = 8월 시작, Winter = 1월 시작)
    is_summer = 'summer' in sheet_name.lower()
    start_date = pd.Timestamp('2025-08-01') if is_summer else pd.Timestamp('2025-01-01')
    
    # 컬럼명 정리
    df.columns = df.columns.str.strip()
    
    # 필요한 컬럼 확인 및 매핑
    required_columns = ['TIME', 'T_external', 'T_air_test_cell', 'T_air_ref_cell', 
                       'Qsens_test_cell(kJ/h)', 'Qsens_ref_cell(kJ/h)', 'Tset', 'tname']
    
    # 컬럼이 존재하는지 확인
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        print(f"  ⚠ 경고: 누락된 컬럼 {missing_columns}")
    
    # 컬럼 이름 매핑
    column_mapping = {
        'TIME': 'time',
        'T_external': 'T_external',
        'T_air_test_cell': 'T_air_test',
        'T_air_ref_cell': 'T_air_ref',
        'Qsens_test_cell(kJ/h)': 'Qsens_test',
        'Qsens_ref_cell(kJ/h)': 'Qsens_ref',
        'Tset': 'Tset',
        'tname': 'timestamp'
    }
    
    # 존재하는 컬럼만 선택
    available_columns = [col for col in column_mapping.keys() if col in df.columns]
    df = df[available_columns].rename(columns=column_mapping)
    
    # NaN 값 처리
    df = df.fillna(0)
    
    # 시간 컬럼을 실제 날짜-시간 형식으로 변환
    if 'time' in df.columns:
        # 각 행에 대해 start_date로부터 분 단위로 증가하는 타임스탬프 생성
        df['datetime'] = [start_date + pd.Timedelta(minutes=i) for i in range(len(df))]
        df['time'] = df['datetime'].dt.strftime('%Y-%m-%d %H:%M:%S')
        df = df.drop('datetime', axis=1)
    
    # 모든 컬럼을 JSON 직렬화 가능한 타입으로 변환
    for col in df.columns:
        # datetime, time 타입을 문자열로 변환
        if df[col].dtype == 'object':
            df[col] = df[col].apply(lambda x: str(x) if x is not None else '')
        # numpy 타입을 기본 Python 타입으로 변환
        elif 'int' in str(df[col].dtype):
            df[col] = df[col].astype(int)
        elif 'float' in str(df[col].dtype):
            df[col] = df[col].astype(float)
    
    total_rows = len(df)
    num_chunks = (total_rows + chunk_size - 1) // chunk_size
    
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"  총 행 수: {total_rows:,}")
    print(f"  청크 수: {num_chunks}")
    
    # 청크별로 저장
    for i in range(num_chunks):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, total_rows)
        
        # 데이터를 딕셔너리로 변환하고 모든 값을 기본 타입으로 변환
        chunk_df = df.iloc[start_idx:end_idx]
        chunk_data = []
        
        for _, row in chunk_df.iterrows():
            row_dict = {}
            for col in chunk_df.columns:
                value = row[col]
                # numpy/pandas 타입을 기본 Python 타입으로 변환
                if pd.isna(value):
                    row_dict[col] = 0
                elif isinstance(value, (pd.Timestamp, pd.Timedelta)):
                    row_dict[col] = str(value)
                elif hasattr(value, 'item'):  # numpy 타입
                    row_dict[col] = value.item()
                else:
                    row_dict[col] = value
            chunk_data.append(row_dict)
        
        chunk_file = os.path.join(output_dir, f'chunk-{i}.json')
        with open(chunk_file, 'w', encoding='utf-8') as f:
            json.dump({'data': chunk_data}, f, ensure_ascii=False, indent=2)
        
        # 진행률 표시 (10개마다)
        if (i + 1) % 10 == 0 or (i + 1) == num_chunks:
            progress = (i + 1) / num_chunks * 100
            print(f"  진행: {i+1}/{num_chunks} ({progress:.1f}%)")
    
    # 메타데이터 생성
    metadata = {
        'sheetName': sheet_name,
        'totalFrames': total_rows,
        'numChunks': num_chunks,
        'chunkSize': chunk_size,
        'startTime': str(df['time'].iloc[0]) if 'time' in df.columns else None,
        'endTime': str(df['time'].iloc[-1]) if 'time' in df.columns else None,
        'season': 'summer' if is_summer else 'winter',
        'startDate': start_date.strftime('%Y-%m-%d'),
    }
    
    # 에너지 데이터 통계 추가
    if 'Qsens_test' in df.columns:
        metadata['minEnergyTest'] = float(df['Qsens_test'].min())
        metadata['maxEnergyTest'] = float(df['Qsens_test'].max())
        metadata['avgEnergyTest'] = float(df['Qsens_test'].mean())
    
    if 'Qsens_ref' in df.columns:
        metadata['minEnergyRef'] = float(df['Qsens_ref'].min())
        metadata['maxEnergyRef'] = float(df['Qsens_ref'].max())
        metadata['avgEnergyRef'] = float(df['Qsens_ref'].mean())
    
    # 메타데이터 저장
    with open(os.path.join(output_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    
    print(f"  ✓ 완료: {output_dir}/\n")

# 실행
if __name__ == '__main__':
    # 파일 경로 설정
    excel_file = './public/data/simulation/Simulation_Results_All.xlsx'
    output_directory = './public/data/simulation'
    
    # 청크 크기 (하루치 분 데이터 = 1440분)
    chunk_size = 1440
    
    print("=" * 60)
    print("엑셀 시트별 JSON 변환 시작")
    print("=" * 60)
    print(f"입력 파일: {excel_file}")
    print(f"출력 디렉토리: {output_directory}")
    print(f"청크 크기: {chunk_size} 프레임\n")
    
    # 변환 실행
    process_excel_sheets_to_json(excel_file, output_directory, chunk_size)
    
    print("\n" + "=" * 60)
    print("처리 완료!")
    print("=" * 60)

