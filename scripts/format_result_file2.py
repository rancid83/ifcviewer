#!/usr/bin/env python3
"""
Result_file2 폴더 내 txt 파일들의 과학 표기법(+0.000E+00)을 일반 소수 형식으로 변환합니다.
- TIME: 시간 (소수 6자리)
- OA, T_air_test_cell, T_h_set, T_c_set: 온도 °C (소수 2자리)
- Qsol, Q_sens_test_cell: W/m2, W (소수 2자리)
- Sign: 운전신호 (정수)
- Month, Day: 월/일 (정수)
- Hour: 일별 시간 (소수 4자리)
"""

from pathlib import Path

RESULT_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "Result_file2"


def parse_value(cell: str, col_index: int) -> str:
    """셀 값을 파싱하여 적절한 형식으로 반환."""
    cell = cell.strip()
    if not cell:
        return cell
    try:
        v = float(cell)
    except ValueError:
        return cell
    if col_index == 0:   # TIME
        return f"{v:.6f}".rstrip("0").rstrip(".") or "0"
    if col_index in (1, 2, 6, 7):  # OA, T_air_test_cell, T_h_set, T_c_set
        return f"{v:.2f}"
    if col_index in (3, 5):  # Qsol, Q_sens_test_cell
        return f"{v:.2f}"
    if col_index == 4:   # Sign
        return str(int(round(v)))
    if col_index in (8, 9):  # Month, Day
        return str(int(round(v)))
    if col_index == 10:  # Hour
        return f"{v:.4f}".rstrip("0").rstrip(".") or "0"
    return f"{v:.4f}"


def process_file(filepath: Path) -> None:
    """단일 파일 변환 (덮어쓰기)."""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    if not lines:
        return

    out_lines = [lines[0].rstrip("\n")]
    for line in lines[1:]:
        line = line.rstrip("\n")
        parts = line.split("\t")
        if not parts:
            out_lines.append(line)
            continue
        formatted = [parse_value(cell, i) for i, cell in enumerate(parts)]
        out_lines.append("\t".join(formatted))

    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out_lines))
        if lines[-1].endswith("\n"):
            f.write("\n")


def main():
    if not RESULT_DIR.is_dir():
        print(f"Directory not found: {RESULT_DIR}")
        return
    txt_files = sorted(RESULT_DIR.glob("*.txt"))
    print(f"Found {len(txt_files)} .txt files in {RESULT_DIR}")
    for i, fp in enumerate(txt_files):
        process_file(fp)
        if (i + 1) % 20 == 0 or i == 0:
            print(f"  Processed {i + 1}/{len(txt_files)}: {fp.name}")
    print(f"Done. Processed {len(txt_files)} files.")


if __name__ == "__main__":
    main()
