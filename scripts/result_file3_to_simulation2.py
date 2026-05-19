#!/usr/bin/env python3
"""
Result_file3 폴더의 txt 파일을 simulation2 형식(chunk JSON + index.json)으로 변환합니다.
- 기존 simulation2 데이터는 건드리지 않고, Result_file3에 해당하는 케이스만 출력합니다.
- 각 레코드에 기존 필드(time, T_external, T_air_test, T_air_ref, Qsens_test, Qsens_ref, Tset)와
  추가 필드 T_air_test_cell, T_h_set, T_c_set, Month, Day, Hour 를 포함합니다.
"""

import json
import re
from pathlib import Path

RESULT_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "Result_file3"
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "simulation2"
CHUNK_SIZE = 1440


def parse_scientific(s: str) -> float:
    s = s.strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def hour_to_time_str(hour_decimal: float) -> str:
    """0~24 소수 시각을 HH:MM:SS 문자열로."""
    total_sec = max(0, min(86400 - 1, int(round(hour_decimal * 3600))))
    h = total_sec // 3600
    m = (total_sec % 3600) // 60
    s = total_sec % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def row_to_record(parts: list, season: str, year: int) -> dict | None:
    if len(parts) < 11:
        return None
    vals = [parse_scientific(p) for p in parts[:11]]
    month = int(round(vals[8]))  # Month
    day = int(round(vals[9]))    # Day
    hour = vals[10]              # Hour (0-24 decimal)
    if month < 1 or month > 12 or day < 1 or day > 31:
        return None
    time_str = f"{year}-{month:02d}-{day:02d} {hour_to_time_str(hour)}"

    oa = vals[1]
    t_air_test_cell = vals[2]
    q_sens = vals[5]
    t_h_set = vals[6]
    t_c_set = vals[7]

    # Tset: summer에서는 냉방, winter에서는 난방 사용 (기존 시뮬레이터 호환)
    tset = t_c_set if season == "summer" else t_h_set

    return {
        "time": time_str,
        "T_external": round(oa, 4),
        "T_air_test": round(t_air_test_cell, 4),
        "T_air_ref": round(t_air_test_cell, 4),
        "Qsens_test": round(q_sens, 4),
        "Qsens_ref": 0.0,
        "Tset": round(tset, 4),
        "T_air_test_cell": round(t_air_test_cell, 4),
        "T_h_set": round(t_h_set, 4),
        "T_c_set": round(t_c_set, 4),
        "Month": month,
        "Day": day,
        "Hour": round(hour, 4),
    }


def parse_filename(name: str) -> tuple[str, str] | None:
    # Case_01_Summer.txt -> ("01", "summer"), Case_81_Winter.txt -> ("81", "winter")
    m = re.match(r"Case_(\d+)_(Summer|Winter)\.txt$", name, re.IGNORECASE)
    if not m:
        return None
    num, season = m.group(1), m.group(2).lower()
    return (num, season)


def convert_file(txt_path: Path) -> tuple[list[dict], str, str] | None:
    """한 txt 파일을 읽어 레코드 리스트와 (case_key, season) 반환."""
    name = txt_path.name
    parsed = parse_filename(name)
    if not parsed:
        return None
    case_num, season = parsed
    year = 2025  # summer/winter 모두 2025 (winter는 1월 기준)

    with open(txt_path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    if not lines:
        return None
    # 헤더는 동일한지 확인만 하고 스킵
    data_lines = [ln.strip() for ln in lines[1:] if ln.strip()]
    records = []
    for line in data_lines:
        parts = line.split("\t")
        rec = row_to_record(parts, season, year)
        if rec:
            records.append(rec)

    if not records:
        return None

    # 원본 txt 의 행 순서가 시간순이 아니므로 time 기준으로 재정렬한다.
    # (정렬하지 않으면 chunk 의 minute 인덱스와 실제 시각이 어긋난다)
    records.sort(key=lambda r: r["time"])

    # 같은 시각이 중복으로 들어온 경우 첫 레코드만 유지
    deduped = []
    seen = None
    dup = 0
    for r in records:
        if r["time"] == seen:
            dup += 1
            continue
        seen = r["time"]
        deduped.append(r)
    if dup:
        print(f"    {name}: 중복 시각 {dup}개 제거")
    records = deduped

    case_key = f"case{int(case_num):02d}-{season}"
    return (records, case_key, season)


def compute_energy_bounds(records: list[dict]) -> dict:
    qs = [r.get("Qsens_test") or 0 for r in records]
    if not qs:
        return {"minEnergyTest": 0, "maxEnergyTest": 0, "avgEnergyTest": 0,
                "minEnergyRef": 0, "maxEnergyRef": 0, "avgEnergyRef": 0}
    avg = sum(qs) / len(qs)
    return {
        "minEnergyTest": min(qs),
        "maxEnergyTest": max(qs),
        "avgEnergyTest": avg,
        "minEnergyRef": min(qs),
        "maxEnergyRef": max(qs),
        "avgEnergyRef": avg,
    }


def write_case(records: list[dict], case_key: str, season: str, out_root: Path) -> None:
    """레코드를 chunk 단위로 나누어 case 폴더에 저장."""
    folder = out_root / case_key
    folder.mkdir(parents=True, exist_ok=True)

    # 기존 chunk 파일 제거 (재생성 시 frame 수가 줄어 옛 chunk 가 남는 것 방지)
    for old in folder.glob("chunk-*.json"):
        old.unlink()

    bounds = compute_energy_bounds(records)
    start_time = records[0]["time"] if records else ""
    end_time = records[-1]["time"] if records else ""
    num_chunks = (len(records) + CHUNK_SIZE - 1) // CHUNK_SIZE

    for ci in range(num_chunks):
        start = ci * CHUNK_SIZE
        chunk_data = records[start : start + CHUNK_SIZE]
        chunk_path = folder / f"chunk-{ci}.json"
        with open(chunk_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump({"data": chunk_data}, f, ensure_ascii=False, indent=2)

    # case01-summer -> Case01_Summer
    parts = case_key.split("-")
    num = parts[0].replace("case", "")
    sheet_name = f"Case{num}_{parts[1].capitalize()}"

    index = {
        "sheetName": sheet_name,
        "totalFrames": len(records),
        "numChunks": num_chunks,
        "chunkSize": CHUNK_SIZE,
        "startTime": start_time,
        "endTime": end_time,
        "minEnergyTest": bounds["minEnergyTest"],
        "maxEnergyTest": bounds["maxEnergyTest"],
        "avgEnergyTest": bounds["avgEnergyTest"],
        "minEnergyRef": bounds["minEnergyRef"],
        "maxEnergyRef": bounds["maxEnergyRef"],
        "avgEnergyRef": bounds["avgEnergyRef"],
        "season": season,
        "startDate": start_time.split(" ")[0] if start_time else "",
    }
    index_path = folder / "index.json"
    with open(index_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)


def main():
    if not RESULT_DIR.is_dir():
        print(f"Result_file3 directory not found: {RESULT_DIR}")
        return
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    txt_files = sorted(RESULT_DIR.glob("*.txt"))
    print(f"Found {len(txt_files)} .txt files in {RESULT_DIR}")
    done = 0
    for i, txt_path in enumerate(txt_files):
        result = convert_file(txt_path)
        if result is None:
            continue
        records, case_key, season = result
        write_case(records, case_key, season, OUT_DIR)
        done += 1
        if (done % 20 == 0) or done <= 2:
            print(f"  [{done}] {txt_path.name} -> {case_key} ({len(records)} rows)")
    print(f"Done. Wrote {done} case folders under {OUT_DIR} (existing data unchanged).")


if __name__ == "__main__":
    main()
