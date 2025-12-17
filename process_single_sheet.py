import pandas as pd
import json
import os
from pathlib import Path
import sys

def process_sheet_data(df, output_dir, sheet_name, is_summer, chunk_size=1440):
    """
    단일 시트 데이터를 청크 파일로 변환
    """
    # 시즌에 따라 시작 날짜 결정 (Summer = 8월 시작, Winter = 1월 시작)
    start_date = pd.Timestamp('2025-08-01') if is_summer else pd.Timestamp('2025-01-01')
    
    # 컬럼명 정리
    df.columns = df.columns.str.strip()
    
    # 필요한 컬럼 확인 및 매핑
    required_columns = ['TIME', 'T_external', 'T_air_test_cell', 'T_air_ref_cell', 
                       'Qsens_test_cell(kJ/h)', 'Qsens_ref_cell(kJ/h)', 'Tset', 'tname']
    
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
        print(f"  시간 데이터 생성 중 (시작: {start_date.strftime('%Y-%m-%d %H:%M:%S')})")
        df['datetime'] = [start_date + pd.Timedelta(minutes=i) for i in range(len(df))]
        df['time'] = df['datetime'].dt.strftime('%Y-%m-%d %H:%M:%S')
        df = df.drop('datetime', axis=1)
    
    # 모든 컬럼을 JSON 직렬화 가능한 타입으로 변환
    for col in df.columns:
        if df[col].dtype == 'object':
            df[col] = df[col].apply(lambda x: str(x) if x is not None else '')
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
        
        chunk_df = df.iloc[start_idx:end_idx]
        chunk_data = []
        
        for _, row in chunk_df.iterrows():
            row_dict = {}
            for col in chunk_df.columns:
                value = row[col]
                if pd.isna(value):
                    row_dict[col] = 0
                elif isinstance(value, (pd.Timestamp, pd.Timedelta)):
                    row_dict[col] = str(value)
                elif hasattr(value, 'item'):
                    row_dict[col] = value.item()
                else:
                    row_dict[col] = value
            chunk_data.append(row_dict)
        
        chunk_file = os.path.join(output_dir, f'chunk-{i}.json')
        with open(chunk_file, 'w', encoding='utf-8') as f:
            json.dump({'data': chunk_data}, f, ensure_ascii=False, indent=2)
        
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
    
    if 'Qsens_test' in df.columns:
        metadata['minEnergyTest'] = float(df['Qsens_test'].min())
        metadata['maxEnergyTest'] = float(df['Qsens_test'].max())
        metadata['avgEnergyTest'] = float(df['Qsens_test'].mean())
    
    if 'Qsens_ref' in df.columns:
        metadata['minEnergyRef'] = float(df['Qsens_ref'].min())
        metadata['maxEnergyRef'] = float(df['Qsens_ref'].max())
        metadata['avgEnergyRef'] = float(df['Qsens_ref'].mean())
    
    with open(os.path.join(output_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    
    print(f"  ✓ 완료: {output_dir}/\n")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("사용법: python3 process_single_sheet.py <sheet_name>")
        print("예: python3 process_single_sheet.py 'Ref_Summer'")
        sys.exit(1)
    
    sheet_name = sys.argv[1]
    excel_file = './public/data/simulation/Simulation_Results_All.xlsx'
    
    # 폴더명 생성
    folder_name = sheet_name.lower().replace(' ', '-').replace('_', '-').replace('+', '-plus').replace('−', '-minus')
    output_dir = f'./public/data/simulation/{folder_name}'
    
    # 시즌 판단
    is_summer = 'summer' in sheet_name.lower()
    
    print(f"처리 중: {sheet_name} -> {folder_name}/")
    print(f"시즌: {'여름 (8월~9월)' if is_summer else '겨울 (1월~2월)'}")
    
    try:
        df = pd.read_excel(excel_file, sheet_name=sheet_name)
        process_sheet_data(df, output_dir, sheet_name, is_summer)
        print("✓ 처리 완료!")
    except Exception as e:
        print(f"✗ 오류 발생: {e}")
        import traceback
        traceback.print_exc()

