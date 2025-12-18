import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IFCLoader } from '/js/IFCLoader.js';

// ============================================
// Three.js 장면 설정
// ============================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xecf0f1);

// 카메라 설정
const container = document.getElementById('viewer-container');
const width = container.clientWidth;
const height = container.clientHeight;
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.set(15, 15, 15);
camera.lookAt(0, 0, 0);

// 렌더러 설정
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
renderer.setPixelRatio(window.devicePixelRatio);
container.innerHTML = '';
container.appendChild(renderer.domElement);

// OrbitControls 설정
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// 확대/축소 기능
function zoomIn() {
    controls.dollyIn(1.2); // 20% 확대
    controls.update();
}

function zoomOut() {
    controls.dollyOut(1.2); // 20% 축소
    controls.update();
}

// 확대/축소 버튼 이벤트 리스너
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');

if (zoomInBtn) {
    zoomInBtn.addEventListener('click', zoomIn);
}

if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', zoomOut);
}

// 조명 추가
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// 그리드 추가
const gridHelper = new THREE.GridHelper(50, 50, 0x34495e, 0xbdc3c7);
scene.add(gridHelper);

// ============================================
// IFC Loader 설정
// ============================================
const ifcLoader = new IFCLoader();
ifcLoader.ifcManager.setWasmPath('/js/');

// IFC 모델 정보
let currentModelID = null;
let ifcModel = null;

// 선택된 요소 정보
let selectedExpressID = null;
let selectedObject = null;

// 클릭해서 선택한 요소들 (시뮬레이션 색상 적용 대상)
const selectedElementsForSimulation = new Set();

// 레이캐스터 및 마우스 설정
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Material 캐시 (메모리 최적화)
const materialCache = new Map();

// 바닥 그리드 추가 여부 플래그
let floorGridAdded = false;

// IFC 모델 상태 UI 업데이트
function updateIFCModelStatus(isLoaded, modelID = null) {
    const statusEl = document.getElementById('ifc-model-status');
    if (statusEl) {
        if (isLoaded && modelID !== null) {
            statusEl.textContent = `✓ 로드 완료 (ID: ${modelID})`;
            statusEl.style.backgroundColor = '#dcfce7';
            statusEl.style.color = '#166534';
            statusEl.style.borderColor = '#22c55e';
        } else {
            statusEl.textContent = '✗ 로드 안됨';
            statusEl.style.backgroundColor = '#fee2e2';
            statusEl.style.color = '#dc2626';
            statusEl.style.borderColor = '#fca5a5';
        }
    }
}

// ============================================
// 케이스 매핑 설정
// ============================================
const CASE_SEASON_MAP = {
    'ref': {
        label: 'Ref (기준값)',
        summer: 'ref-summer',
        winter: 'ref-winter'
    },
    'case1+': {
        label: 'Case1+ (인체/기기/조명 +30%)',
        summer: 'case1-plus-summer',
        winter: 'case1-plus-winter'
    },
    'case1-': {
        label: 'Case1- (인체/기기/조명 -30%)',
        summer: 'case1-summer',
        winter: 'case1-winter'
    },
    'case2+': {
        label: 'Case2+ (외기 도입량 +50%)',
        summer: 'case2-plus-summer',
        winter: 'case2-plus-winter'
    },
    'case2-': {
        label: 'Case2- (외기 도입량 -50%)',
        summer: 'case2-summer',
        winter: 'case2-winter'
    },
    'case3+': {
        label: 'Case3+ (난방 -2℃, 냉방 +2℃)',
        summer: 'case3-plus-summer',
        winter: 'case3-plus-winter'
    },
    'case3-': {
        label: 'Case3- (난방 +2℃, 냉방 -2℃)',
        summer: 'case3-summer',
        winter: 'case3-winter'
    },
    'case4+': {
        label: 'Case4+ (사용시간 +2시간)',
        summer: 'case4-plus-summer',
        winter: 'case4-plus-winter'
    },
    'case4-': {
        label: 'Case4- (사용시간 -2시간)',
        summer: 'case4-summer',
        winter: 'case4-winter'
    }
};

// ============================================
// 시뮬레이션 데이터 매니저
// ============================================
class SimulationDataManager {
    constructor() {
        this.chunkSize = 1440;
        this.currentCase = 'ref';
        this.currentSeason = 'summer';
        this.loadedChunks = new Map();
        this.currentMetadata = null;
        this.cacheSize = 20; // 5 → 20으로 증가 (메모리 최적화)
    }

    getCurrentDataPath() {
        const caseConfig = CASE_SEASON_MAP[this.currentCase];
        if (!caseConfig) {
            console.error(`Unknown case: ${this.currentCase}`);
            return null;
        }
        return caseConfig[this.currentSeason];
    }

    async loadMetadata(caseName, season) {
        this.currentCase = caseName;
        this.currentSeason = season;

        const dataPath = this.getCurrentDataPath();
        if (!dataPath) return null;

        try {
            const response = await fetch(`/data/simulation/${dataPath}/index.json`);
            this.currentMetadata = await response.json();
            console.log(`✓ Loaded metadata for ${dataPath}:`, this.currentMetadata);
            return this.currentMetadata;
        } catch (error) {
            console.error(`Failed to load metadata for ${dataPath}:`, error);
            return null;
        }
    }

    async loadChunk(chunkIndex, skipCache = false) {
        const dataPath = this.getCurrentDataPath();
        const cacheKey = `${dataPath}-${chunkIndex}`;

        // skipCache가 true면 캐시 무시하고 직접 로드
        if (!skipCache && this.loadedChunks.has(cacheKey)) {
            return this.loadedChunks.get(cacheKey);
        }

        try {
            const response = await fetch(`/data/simulation/${dataPath}/chunk-${chunkIndex}.json`);
            const chunk = await response.json();

            // skipCache가 false일 때만 캐싱
            if (!skipCache) {
                if (this.loadedChunks.size >= this.cacheSize) {
                    const firstKey = this.loadedChunks.keys().next().value;
                    this.loadedChunks.delete(firstKey);
                }

                this.loadedChunks.set(cacheKey, chunk);
            }

            return chunk;
        } catch (error) {
            console.error(`Failed to load chunk ${chunkIndex} for ${dataPath}:`, error);
            return null;
        }
    }

    async getFrameByIndex(index) {
        const chunkIndex = Math.floor(index / this.chunkSize);
        const chunk = await this.loadChunk(chunkIndex);

        if (!chunk) return null;

        const localIndex = index % this.chunkSize;
        return chunk.data[localIndex];
    }

    async preloadNextChunk(currentIndex) {
        const currentChunkIndex = Math.floor(currentIndex / this.chunkSize);
        const progressInChunk = (currentIndex % this.chunkSize) / this.chunkSize;

        if (progressInChunk > 0.8) {
            const nextChunkIndex = currentChunkIndex + 1;
            if (this.currentMetadata && nextChunkIndex * this.chunkSize < this.currentMetadata.totalFrames) {
                this.loadChunk(nextChunkIndex);
            }
        }
    }

    clearCache() {
        this.loadedChunks.clear();
        console.log('Cache cleared');
    }

    async changeSeason(newSeason) {
        if (this.currentSeason === newSeason) return;

        console.log(`Changing season: ${this.currentSeason} → ${newSeason}`);
        this.clearCache();
        await this.loadMetadata(this.currentCase, newSeason);
    }

    async changeCase(newCase) {
        if (this.currentCase === newCase) return;

        console.log(`Changing case: ${this.currentCase} → ${newCase}`);
        this.clearCache();
        await this.loadMetadata(newCase, this.currentSeason);
    }
}

const dataManager = new SimulationDataManager();

// ============================================
// UI 이벤트 핸들러
// ============================================

// 파일 불러오기 버튼
const loadIFCBtn = document.getElementById('load-ifc-btn');
const ifcFileInput = document.getElementById('ifc-file-input');

loadIFCBtn.addEventListener('click', () => {
    ifcFileInput.click();
});

ifcFileInput.addEventListener('change', async(event) => {
    const file = event.target.files[0];
    if (file) {
        await loadIFCFile(file, true);
    }
});

// IFC 파일 로드 함수 (Promise로 래핑)
async function loadIFCFile(file, showAlert = true) {

    // 기존 모델이 있으면 제거
    if (ifcModel) {
        scene.remove(ifcModel);
        ifcModel = null;
        currentModelID = null;
    }

    const url = URL.createObjectURL(file);

    return new Promise((resolve, reject) => {
        try {
            ifcLoader.load(
                url,
                async(loadedModel) => {
                    scene.add(loadedModel);
                    const modelID = loadedModel.modelID;

                    currentModelID = modelID;
                    ifcModel = loadedModel;

                    // 모델을 중앙에 배치
                    const box = new THREE.Box3().setFromObject(loadedModel);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());

                    const maxDim = Math.max(size.x, size.y, size.z);
                    const fov = camera.fov * (Math.PI / 180);
                    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                    cameraZ *= 1.5;

                    camera.position.set(
                        center.x + cameraZ * 0.3, // X축 약간 오른쪽으로
                        center.y + cameraZ * 0.75, // Y축 더 낮춤 (높이 감소)
                        center.z + cameraZ * 1.0 // Z축 뒤로 (비스듬한 각도)
                    );
                    camera.lookAt(center);
                    controls.target.copy(center);
                    controls.update();

                    // 바닥 그리드 및 Zone 라벨 추가
                    addFloorGridAndLabels();

                    // UI 상태 업데이트
                    updateIFCModelStatus(true, modelID);

                    // 수동 로드일 때만 alert 표시
                    if (showAlert) {
                        alert(`IFC 파일이 성공적으로 로드되었습니다!\n파일명: ${file.name}`);
                    }

                    URL.revokeObjectURL(url);

                    // IFC.js 완전 초기화를 위한 지연 후 첫 프레임 시각화
                    setTimeout(async() => {
                        if (filteredIndices.length > 0) {
                            await updateVisualization(filteredIndices[0]);
                            console.log('✅ 첫 프레임 시각화 완료');
                        }
                    }, 1000); // 200ms → 1000ms로 증가

                    resolve(loadedModel);
                },
                (progress) => {
                    // 진행률 로그 제거
                },
                (error) => {
                    updateIFCModelStatus(false);

                    if (showAlert) {
                        alert(`IFC 파일 로드에 실패했습니다.\n\n에러: ${error.message}`);
                    }
                    URL.revokeObjectURL(url);
                    reject(error);
                }
            );
        } catch (error) {
            console.error('IFC 파일 처리 중 오류:', error);
            if (showAlert) {
                alert('IFC 파일 처리 중 오류가 발생했습니다.');
            }
            URL.revokeObjectURL(url);
            reject(error);
        }
    });
}

// ============================================
// 전역 변수
// ============================================
let currentMinute = 0;
let totalMinutes = 0;
let isPlaying = false;
let animationFrameId = null;
let playbackSpeed = 10; // 기본 재생 속도 (10x)
let lastUpdateTime = 0;
let lastRenderedFrame = -1; // 마지막으로 렌더링된 프레임 (메모리 최적화)

// 시간 필터링 관련
let timeRangeFilter = '07-18'; // '07-16', '07-18', '07-20' (기본값: 07-18)
let filteredIndices = []; // 필터링된 프레임 인덱스 배열
let currentFilteredIndex = 0; // 필터링된 배열에서의 현재 위치
let playFullRange = true; // 전체 재생 모드 (true: 전체 재생, false: 사용시간 필터 적용)

// 날짜 선택 관련
let availableDates = []; // 선택 가능한 날짜 목록
let selectedDate = null; // 현재 선택된 날짜 (Date 객체)
let dailyStartIndex = 0; // 선택된 날짜의 07:00 시작 인덱스
let dailyEndIndex = 780; // 선택된 날짜의 20:00 종료 인덱스 (780분 = 13시간)

// ============================================
// 유틸리티 함수
// ============================================
function throttle(func, delay) {
    let lastCall = 0;
    let timeoutId = null;

    return function(...args) {
        const now = Date.now();

        if (now - lastCall >= delay) {
            lastCall = now;
            func(...args);
        } else {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                func(...args);
            }, delay);
        }
    };
}

// 절대 차이값 기준 색상 생성 (차이 작음 = 파랑, 차이 큼 = 빨강)
function getColorFromDifference(absDiff, maxDiff) {
    // 절대값 차이를 0~1로 정규화
    const normalized = Math.max(0, Math.min(1, absDiff / maxDiff));

    // 색상 맵핑: 0.0(파랑) → 1.0(빨강)
    const hue = (1 - normalized) * 240; // 240 = 파란색, 0 = 빨간색
    return new THREE.Color(`hsl(${hue}, 100%, 50%)`);
}

// 레전드용 색상 문자열 생성
function getColorStringFromDifference(absDiff, maxDiff) {
    const normalized = Math.max(0, Math.min(1, absDiff / maxDiff));
    const hue = (1 - normalized) * 240;
    return `hsl(${hue}, 100%, 50%)`;
}

// 부호가 있는 차이값 기준 색상 생성 (음수 = 파랑, 양수 = 빨강)
function getColorFromSignedDifference(diff, maxAbsDiff) {
    // diff: -300 ~ +300 범위의 차이값
    // maxAbsDiff: 최대 절대값 (300)

    const clampedDiff = Math.max(-maxAbsDiff, Math.min(maxAbsDiff, diff));
    const normalized = clampedDiff / maxAbsDiff; // -1.0 ~ +1.0

    let hue, saturation, lightness;

    if (normalized < 0) {
        // 음수: 파랑 계열 (240도)
        hue = 240;
        const intensity = Math.abs(normalized); // 0 ~ 1
        saturation = 50 + (intensity * 50); // 50% ~ 100%
        lightness = 70 - (intensity * 30); // 70% ~ 40% (진해짐)
    } else if (normalized > 0) {
        // 양수: 빨강 계열 (0도)
        hue = 0;
        const intensity = normalized; // 0 ~ 1
        saturation = 50 + (intensity * 50); // 50% ~ 100%
        lightness = 70 - (intensity * 30); // 70% ~ 40% (진해짐)
    } else {
        // 0: 흰색
        return new THREE.Color(0xffffff);
    }

    return new THREE.Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
}

// 레전드용 색상 문자열 생성 (부호 있는 버전)
function getColorStringFromSignedDifference(diff, maxAbsDiff) {
    const clampedDiff = Math.max(-maxAbsDiff, Math.min(maxAbsDiff, diff));
    const normalized = clampedDiff / maxAbsDiff;

    let hue, saturation, lightness;

    if (normalized < 0) {
        hue = 240;
        const intensity = Math.abs(normalized);
        saturation = 50 + (intensity * 50);
        lightness = 70 - (intensity * 30);
    } else if (normalized > 0) {
        hue = 0;
        const intensity = normalized;
        saturation = 50 + (intensity * 50);
        lightness = 70 - (intensity * 30);
    } else {
        return 'hsl(0, 0%, 100%)';
    }

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// 에너지 차이값 최대 범위 (-300 ~ +300)
let globalMaxDiff = 300;

// 에너지 레전드 생성 (부호 있는 차이값 기준: -300 ~ +300)
function createEnergyLegend() {
    const metadata = dataManager.currentMetadata;
    if (!metadata) return;

    // 차이값 범위: -300 ~ +300
    const maxDiff = 300;
    globalMaxDiff = maxDiff;

    const legendContainer = document.getElementById('energy-legend');
    if (!legendContainer) return;

    legendContainer.innerHTML = '';

    // 그라디언트 바를 위한 색상 배열 생성 (왼쪽이 파랑, 오른쪽이 빨강)
    const numGradientSteps = 100; // 그라디언트를 위한 더 많은 단계
    const gradientColors = [];

    for (let i = 0; i <= numGradientSteps; i++) {
        const diff = -maxDiff + (maxDiff * 2 * i / numGradientSteps); // -300 → +300 (왼쪽이 파랑)
        const color = getColorStringFromSignedDifference(diff, maxDiff);
        const percent = (i / numGradientSteps) * 100;
        gradientColors.push(`${color} ${percent}%`);
    }

    // 그라디언트 바 컨테이너 (padding 추가하여 양옆 텍스트가 안쪽에 들어오도록)
    const gradientBarContainer = document.createElement('div');
    gradientBarContainer.style.cssText = `
        width: 100%;
        margin-bottom: 5px;
        padding: 0 50px;
        box-sizing: border-box;
    `;

    // 그라디언트 바 (높이 줄임)
    const gradientBar = document.createElement('div');
    gradientBar.style.cssText = `
        width: 100%;
        height: 20px;
        background: linear-gradient(to right, ${gradientColors.join(', ')});
        border-radius: 4px;
        border: 1px solid #ddd;
        position: relative;
    `;
    gradientBarContainer.appendChild(gradientBar);

    // 레이블 컨테이너 (높이 줄임, 눈금선 제거, padding 추가)
    const scaleContainer = document.createElement('div');
    scaleContainer.style.cssText = `
        width: 100%;
        position: relative;
        height: 18px;
        margin-top: 2px;
        padding: 0 50px;
        box-sizing: border-box;
    `;

    // 눈금 표시 (최소, 중간, 최대) - 눈금선 없이 텍스트만
    const tickValues = [-300, -200, -100, 0, 100, 200, 300];

    tickValues.forEach((value) => {
        const tickContainer = document.createElement('div');
        const position = ((value + maxDiff) / (maxDiff * 2)) * 100; // 0% ~ 100%

        // 양쪽 끝(-300, +300)은 transform을 조정하여 안쪽으로 이동
        let transformX = '-50%';
        if (value === -300) {
            transformX = '0%'; // 왼쪽 끝은 왼쪽 정렬
        } else if (value === 300) {
            transformX = '-100%'; // 오른쪽 끝은 오른쪽 정렬
        }

        tickContainer.style.cssText = `
            position: absolute;
            left: ${position}%;
            transform: translateX(${transformX});
            display: flex;
            flex-direction: column;
            align-items: center;
        `;

        // 레이블 (단위 포함)
        const tickLabel = document.createElement('div');
        const sign = value > 0 ? '+' : '';
        tickLabel.textContent = `${sign}${value} kJ/h`;
        tickLabel.style.cssText = `
            font-size: 10px;
            color: #666;
            font-weight: 500;
            white-space: nowrap;
        `;

        tickContainer.appendChild(tickLabel);
        scaleContainer.appendChild(tickContainer);
    });

    legendContainer.appendChild(gradientBarContainer);
    legendContainer.appendChild(scaleContainer);

    console.log(`✓ 레전드 생성 완료 (그래프 형식, 부호 있는 차이값 기준): -${maxDiff} ~ +${maxDiff} kJ/h`);
}

// ============================================
// 여름/겨울 시즌 토글
// ============================================
const seasonBtns = document.querySelectorAll('.season-btn');

seasonBtns.forEach(btn => {
    btn.addEventListener('click', async() => {
        // 재생 중이면 정지
        if (isPlaying) {
            stopPlayback();
        }

        seasonBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const newSeason = btn.dataset.season;
        console.log('Season changed to:', newSeason);

        await dataManager.changeSeason(newSeason);

        const metadata = dataManager.currentMetadata;
        if (metadata) {
            totalMinutes = metadata.totalFrames;

            // Test Zone의 현재 사용 시간 값 읽기
            const testTimeSelect = document.getElementById('test-time');
            if (testTimeSelect) {
                timeRangeFilter = testTimeSelect.value;
                console.log('시즌 변경 → 재생 범위:', timeRangeFilter);
            }

            // 전체 재생 모드가 아닐 때만 필터링된 인덱스 재생성
            if (!playFullRange) {
                await buildFilteredIndices();
            }
            updateSliderRange();

            // 첫 프레임으로 이동
            if (playFullRange) {
                currentMinute = 0;
                await updateVisualization(currentMinute);
            } else {
                currentFilteredIndex = 0;
                if (filteredIndices.length > 0) {
                    currentMinute = filteredIndices[0];
                    await updateVisualization(currentMinute);
                }
            }

            // 날짜 목록 재생성 (시즌이 변경되면 날짜 범위가 달라짐)
            await populateDateSelects();

            // 레전드 업데이트
            createEnergyLegend();
        }
    });
});

// ============================================
// 시간 슬라이더
// ============================================
const timeSlider = document.getElementById('time-slider');

const throttledUpdate = throttle(async(minute) => {
    currentMinute = minute;
    await updateVisualization(minute);
    dataManager.preloadNextChunk(minute);
}, 100);

timeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);

    // 재생 중이면 정지
    if (isPlaying) {
        stopPlayback();
    }

    if (playFullRange) {
        // 전체 재생 모드: 직접 분 인덱스 사용
        currentMinute = value;
        lastRenderedFrame = value;
        throttledUpdate(currentMinute);
    } else {
        // 필터링 모드: 기존 로직 유지
        currentFilteredIndex = value;
        lastRenderedFrame = value;

        if (filteredIndices.length > 0 && value < filteredIndices.length) {
            currentMinute = filteredIndices[value];
            throttledUpdate(currentMinute);
        }
    }
});

// ============================================
// 재생/정지 컨트롤
// ============================================
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const speedSelect = document.getElementById('speed-select');

// 재생 버튼
playBtn.addEventListener('click', () => {
    startPlayback();
});

// 정지 버튼
pauseBtn.addEventListener('click', () => {
    stopPlayback();
});

// 재생 속도 변경
speedSelect.addEventListener('change', (e) => {
    playbackSpeed = parseInt(e.target.value);
    console.log('재생 속도 변경:', playbackSpeed + 'x');
});

// 사용하지 않는 subset 정리 (메모리 최적화)
function cleanupOldSubsets() {
    const subsets = [];
    scene.traverse((child) => {
        if (child.userData && child.userData.subset) {
            subsets.push(child);
        }
    });

    // 100개 이상의 subset이 있으면 정리
    if (subsets.length > 100) {
        subsets.forEach(subset => {
            scene.remove(subset);
            if (subset.geometry) subset.geometry.dispose();
            if (subset.material) {
                // materialCache에 없는 material만 dispose
                const isCached = Array.from(materialCache.values()).includes(subset.material);
                if (!isCached) {
                    subset.material.dispose();
                }
            }
        });
    }
}

// 재생 시작
function startPlayback() {
    if (isPlaying) return;

    // 재생 시작 전 불필요한 subset 정리 (메모리 최적화)
    cleanupOldSubsets();

    isPlaying = true;
    playBtn.disabled = true;
    pauseBtn.disabled = false;

    // 전체 재생 모드에 따라 초기값 설정
    if (playFullRange) {
        currentMinute = parseInt(timeSlider.value);
        timeSlider.max = totalMinutes - 1;
        console.log(`재생 시작 (속도: ${playbackSpeed}x, 전체 재생 모드)`);
    } else {
        currentFilteredIndex = parseInt(timeSlider.value);
        console.log(`재생 시작 (속도: ${playbackSpeed}x, 필터링 모드)`);
    }

    lastUpdateTime = performance.now();
    playbackLoop();
}

// 재생 정지
function stopPlayback() {
    if (!isPlaying) return;

    isPlaying = false;
    playBtn.disabled = false;
    pauseBtn.disabled = true;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    lastRenderedFrame = -1; // 프레임 카운터 리셋

    console.log('재생 정지');
}

// 재생 루프
function playbackLoop() {
    if (!isPlaying) return;

    const now = performance.now();
    const deltaTime = now - lastUpdateTime;

    const framesPerSecond = 60;
    const minutesPerFrame = (playbackSpeed / framesPerSecond);
    const deltaSeconds = deltaTime / 1000;
    const framesToAdd = minutesPerFrame * deltaSeconds * framesPerSecond;

    if (playFullRange) {
        // 전체 재생 모드: 사용시간 필터 무시하고 전체 시간대 재생
        currentMinute += framesToAdd;

        // 끝에 도달하면 정지
        if (currentMinute >= totalMinutes - 1) {
            currentMinute = totalMinutes - 1;
            stopPlayback();
        }

        // 실제 프레임 인덱스로 변환
        const intMinute = Math.floor(currentMinute);

        // 프레임이 실제로 변경되었을 때만 업데이트 (메모리 최적화)
        if (intMinute !== lastRenderedFrame && intMinute < totalMinutes) {
            lastRenderedFrame = intMinute;

            // 슬라이더 업데이트 (전체 범위 기준)
            timeSlider.max = totalMinutes - 1;
            timeSlider.value = intMinute;

            // 시각화 업데이트
            updateVisualization(intMinute);

            // 다음 청크 미리 로드
            dataManager.preloadNextChunk(intMinute);
        }
    } else {
        // 필터링된 재생 모드: 기존 로직 유지
        currentFilteredIndex += framesToAdd;

        // 끝에 도달하면 정지
        if (currentFilteredIndex >= filteredIndices.length - 1) {
            currentFilteredIndex = filteredIndices.length - 1;
            stopPlayback();
        }

        // 실제 프레임 인덱스로 변환
        const intFilteredIdx = Math.floor(currentFilteredIndex);

        // 프레임이 실제로 변경되었을 때만 업데이트 (메모리 최적화)
        if (intFilteredIdx !== lastRenderedFrame && intFilteredIdx < filteredIndices.length) {
            lastRenderedFrame = intFilteredIdx;
            currentMinute = filteredIndices[intFilteredIdx];

            // 슬라이더 업데이트 (필터링된 인덱스 기준)
            timeSlider.value = intFilteredIdx;

            // 시각화 업데이트
            updateVisualization(currentMinute);

            // 다음 청크 미리 로드
            dataManager.preloadNextChunk(currentMinute);
        }
    }

    lastUpdateTime = now;
    animationFrameId = requestAnimationFrame(playbackLoop);
}

// ============================================
// 시간 범위 필터링
// ============================================

// Test Zone 사용 시간 변경 시 자동으로 시간 범위 필터링
const testTimeSelect = document.getElementById('test-time');

if (testTimeSelect) {
    testTimeSelect.addEventListener('change', async(e) => {
        const selectedTime = e.target.value;
        timeRangeFilter = selectedTime; // '07-16', '07-18', '07-20'

        console.log('사용 시간 변경 → 재생 범위:', timeRangeFilter);

        // 재생 중이면 정지
        if (isPlaying) {
            stopPlayback();
        }

        // 전체 재생 모드가 아닐 때만 필터링된 인덱스 생성
        if (!playFullRange) {
            await buildFilteredIndices();
        }

        // 슬라이더 범위 업데이트
        updateSliderRange();

        // 일별 슬라이더 범위도 업데이트
        if (dataManager.currentMetadata) {
            await findDailyTimeRange();
            const dailySlider = document.getElementById('daily-time-slider');
            if (dailySlider) {
                dailySlider.value = 0;
                updateDailyDisplay(0);
            }
        }

        // 첫 프레임으로 이동
        if (playFullRange) {
            currentMinute = 0;
            timeSlider.value = 0;
            await updateVisualization(currentMinute);
        } else {
            currentFilteredIndex = 0;
            if (filteredIndices.length > 0) {
                currentMinute = filteredIndices[0];
                timeSlider.value = 0;
                await updateVisualization(currentMinute);
            }
        }
    });
}

// 필터링된 인덱스 생성
async function buildFilteredIndices() {
    filteredIndices = [];

    // 시간 범위 파싱
    let startHour = 7;
    let endHour = 18; // 기본값

    switch (timeRangeFilter) {
        case '07-16':
            startHour = 7;
            endHour = 16;
            break;
        case '07-18':
            startHour = 7;
            endHour = 18;
            break;
        case '07-20':
            startHour = 7;
            endHour = 20;
            break;
        default:
            // 알 수 없는 값이면 전체 범위
            console.log('✓ 전체 범위 선택');
            for (let i = 0; i < totalMinutes; i++) {
                filteredIndices.push(i);
            }
            return;
    }

    console.log(`⏳ 시간 필터링 중: ${startHour}:00 ~ ${endHour}:00`);
    console.log(`   전체 프레임: ${totalMinutes.toLocaleString()}`);

    // 모든 청크를 순회하며 시간 범위에 맞는 인덱스 찾기
    const metadata = dataManager.currentMetadata;
    if (!metadata) return;

    const numChunks = metadata.numChunks;
    const chunkSize = metadata.chunkSize;

    console.log(`   청크 수: ${numChunks}, 청크 크기: ${chunkSize}`);

    let processedFrames = 0;
    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
        // 캐시를 사용하지 않고 직접 로드 (메모리 효율을 위해)
        const chunk = await dataManager.loadChunk(chunkIdx, true);
        if (!chunk || !chunk.data) {
            console.warn(`   청크 ${chunkIdx} 로드 실패`);
            continue;
        }

        const chunkDataLength = chunk.data.length;

        for (let localIdx = 0; localIdx < chunkDataLength; localIdx++) {
            const frame = chunk.data[localIdx];
            const globalIdx = chunkIdx * chunkSize + localIdx;

            // totalMinutes를 넘지 않도록 체크
            if (globalIdx >= totalMinutes) {
                console.log(`   청크 ${chunkIdx}: globalIdx(${globalIdx}) >= totalMinutes(${totalMinutes}), 중단`);
                break;
            }

            processedFrames++;

            if (frame && frame.time) {
                // 시간 문자열 파싱 (여러 형식 지원)
                let hour;
                const timeStr = frame.time.toString();

                if (timeStr.includes(' ')) {
                    // "1900-01-01 07:30:00" 형식
                    const timePart = timeStr.split(' ')[1];
                    hour = parseInt(timePart.split(':')[0]);
                } else {
                    // "07:30:00" 형식
                    hour = parseInt(timeStr.split(':')[0]);
                }

                // 시간 범위 체크
                if (hour >= startHour && hour <= endHour) {
                    filteredIndices.push(globalIdx);
                }
            }
        }

        // 진행 상황 표시 (10개 청크마다)
        if ((chunkIdx + 1) % 10 === 0 || chunkIdx === numChunks - 1) {
            console.log(`   진행: ${chunkIdx + 1}/${numChunks} 청크, 처리된 프레임: ${processedFrames.toLocaleString()}, 필터링된 프레임: ${filteredIndices.length.toLocaleString()}`);
        }
    }

    console.log(`   총 처리된 프레임: ${processedFrames.toLocaleString()}`);

    console.log(`✓ 필터링 완료: ${filteredIndices.length.toLocaleString()} 프레임 (${startHour}:00 ~ ${endHour}:00)`);
}

// 슬라이더 범위 업데이트
function updateSliderRange() {
    if (playFullRange) {
        // 전체 재생 모드: 전체 범위로 설정
        timeSlider.max = totalMinutes - 1;
        timeSlider.value = 0;
        console.log('✓ 슬라이더 범위 업데이트 (전체 재생):', totalMinutes.toLocaleString());
    } else if (filteredIndices.length > 0) {
        // 필터링 모드: 필터링된 범위로 설정
        timeSlider.max = filteredIndices.length - 1;
        timeSlider.value = 0;
        console.log('✓ 슬라이더 범위 업데이트 (필터링):', filteredIndices.length.toLocaleString());
    }
}

// ============================================
// Test Zone Input 색상 업데이트 함수
// ============================================
function updateInputColors(selectedCase) {
    const refCase = simulationCases['ref'];
    const currentCase = simulationCases[selectedCase];

    if (!refCase || !currentCase) return;

    // 각 파라미터별로 비교하여 색상 설정
    updateInputColor('test-human', currentCase.human, refCase.human);
    updateInputColor('test-equipment', currentCase.equipment, refCase.equipment);
    updateInputColor('test-lighting', currentCase.lighting, refCase.lighting);
    updateInputColor('test-outdoor', currentCase.outdoor, refCase.outdoor);
    updateInputColor('test-heating', currentCase.heating, refCase.heating);
    updateInputColor('test-cooling', currentCase.cooling, refCase.cooling);

    // 사용시간은 select이므로 별도 처리
    const testTimeSelect = document.getElementById('test-time');
    if (testTimeSelect) {
        if (currentCase.time === '07-20') {
            // Case4+: 사용시간 증가
            testTimeSelect.style.backgroundColor = '#ffebee';
            testTimeSelect.style.color = '#c62828';
            testTimeSelect.style.fontWeight = '600';
        } else if (currentCase.time === '07-16') {
            // Case4-: 사용시간 감소
            testTimeSelect.style.backgroundColor = '#e3f2fd';
            testTimeSelect.style.color = '#1565c0';
            testTimeSelect.style.fontWeight = '600';
        } else {
            // 기본값
            testTimeSelect.style.backgroundColor = '';
            testTimeSelect.style.color = '';
            testTimeSelect.style.fontWeight = '';
        }
    }
}

function updateInputColor(inputId, currentValue, refValue) {
    const inputElement = document.getElementById(inputId);
    if (!inputElement) return;

    if (currentValue > refValue) {
        // 증가: 빨간색 배경
        inputElement.style.backgroundColor = '#ffebee';
        inputElement.style.color = '#c62828';
        inputElement.style.fontWeight = '600';
        inputElement.style.border = '2px solid #ef5350';
    } else if (currentValue < refValue) {
        // 감소: 파란색 배경
        inputElement.style.backgroundColor = '#e3f2fd';
        inputElement.style.color = '#1565c0';
        inputElement.style.fontWeight = '600';
        inputElement.style.border = '2px solid #42a5f5';
    } else {
        // 변경 없음: 기본 스타일
        inputElement.style.backgroundColor = '';
        inputElement.style.color = '';
        inputElement.style.fontWeight = '';
        inputElement.style.border = '';
    }
}

// ============================================
// 케이스 선택 이벤트
// ============================================
const testCaseSelect = document.getElementById('test-case');

testCaseSelect.addEventListener('change', async(e) => {
    const selectedCase = e.target.value;

    // 재생 중이면 정지
    if (isPlaying) {
        stopPlayback();
    }

    // Test Zone 파라미터 값 업데이트
    const caseData = simulationCases[selectedCase];
    if (caseData) {
        document.getElementById('test-human').value = caseData.human;
        document.getElementById('test-equipment').value = caseData.equipment;
        document.getElementById('test-lighting').value = caseData.lighting;
        document.getElementById('test-outdoor').value = caseData.outdoor;
        document.getElementById('test-heating').value = caseData.heating;
        document.getElementById('test-cooling').value = caseData.cooling;
        document.getElementById('test-time').value = caseData.time;

        // 변경된 값에 색상 적용
        updateInputColors(selectedCase);

        // 사용 시간에 따라 재생 범위 설정
        timeRangeFilter = caseData.time; // '07-16', '07-18', '07-20'
        console.log('케이스 변경 → 사용 시간:', caseData.time, '→ 재생 범위:', timeRangeFilter);
    }

    // 데이터 매니저 케이스 변경
    await dataManager.changeCase(selectedCase);

    const metadata = dataManager.currentMetadata;
    if (metadata) {
        totalMinutes = metadata.totalFrames;

        // 전체 재생 모드가 아닐 때만 필터링된 인덱스 재생성
        if (!playFullRange) {
            await buildFilteredIndices();
        }
        updateSliderRange();

        // 첫 프레임으로 이동
        if (playFullRange) {
            currentMinute = 0;
            await updateVisualization(currentMinute);
        } else {
            currentFilteredIndex = 0;
            if (filteredIndices.length > 0) {
                currentMinute = filteredIndices[0];
                await updateVisualization(currentMinute);
            }
        }

        // 레전드 업데이트
        createEnergyLegend();
    }
});

// ============================================
// 시뮬레이션 케이스 데이터
// ============================================
const simulationCases = {
    'ref': {
        human: 22.3,
        equipment: 50.4,
        lighting: 23.4,
        outdoor: 6,
        heating: 20,
        cooling: 26,
        time: '07-18'
    },
    'case1+': {
        human: 29.0,
        equipment: 65.5,
        lighting: 30.4,
        outdoor: 6,
        heating: 20,
        cooling: 26,
        time: '07-18'
    },
    'case1-': {
        human: 15.6,
        equipment: 35.3,
        lighting: 16.4,
        outdoor: 6,
        heating: 20,
        cooling: 26,
        time: '07-18'
    },
    'case2+': {
        human: 22.3,
        equipment: 50.4,
        lighting: 23.4,
        outdoor: 9,
        heating: 20,
        cooling: 26,
        time: '07-18'
    },
    'case2-': {
        human: 22.3,
        equipment: 50.4,
        lighting: 23.4,
        outdoor: 3,
        heating: 20,
        cooling: 26,
        time: '07-18'
    },
    'case3+': {
        human: 22.3,
        equipment: 50.4,
        lighting: 23.4,
        outdoor: 6,
        heating: 18,
        cooling: 28,
        time: '07-18'
    },
    'case3-': {
        human: 22.3,
        equipment: 50.4,
        lighting: 23.4,
        outdoor: 6,
        heating: 22,
        cooling: 24,
        time: '07-18'
    },
    'case4+': {
        human: 22.3,
        equipment: 50.4,
        lighting: 23.4,
        outdoor: 6,
        heating: 20,
        cooling: 26,
        time: '07-20'
    },
    'case4-': {
        human: 22.3,
        equipment: 50.4,
        lighting: 23.4,
        outdoor: 6,
        heating: 20,
        cooling: 26,
        time: '07-16'
    }
};


// ============================================
// 분석 하기 버튼
// ============================================
const analyzeBtn = document.getElementById('analyze-btn');

analyzeBtn.addEventListener('click', async() => {
    console.log('분석 시작...');

    if (!dataManager.currentMetadata) {
        alert('시뮬레이션 데이터가 로드되지 않았습니다.');
        return;
    }

    // 시뮬레이션 설정 값 읽기
    const refTime = document.getElementById('ref-time').value;
    const testCase = document.getElementById('test-case').value;

    const refCellSettings = {
        humanHeat: 22.3,
        equipmentHeat: 50.4,
        lightingHeat: 23.4,
        outdoorAir: 6,
        heatingSetting: 20,
        coolingSetting: 26,
        usageTime: refTime
    };

    const testCellSettings = {
        humanHeat: parseFloat(document.getElementById('test-human').value),
        equipmentHeat: parseFloat(document.getElementById('test-equipment').value),
        lightingHeat: parseFloat(document.getElementById('test-lighting').value),
        outdoorAir: parseFloat(document.getElementById('test-outdoor').value),
        heatingSetting: parseFloat(document.getElementById('test-heating').value),
        coolingSetting: parseFloat(document.getElementById('test-cooling').value),
        usageTime: document.getElementById('test-time').value
    };

    console.log('Ref Zone 설정:', refCellSettings);
    console.log('Test Zone 설정 (', testCase, '):', testCellSettings);

    // 에너지 분석 실행
    await performEnergyAnalysis(refCellSettings, testCellSettings, testCase);

    // 분석 완료 후 자동으로 재생 시작
    startPlayback();
});

// 에너지 분석 수행
async function performEnergyAnalysis(refCell, testCell, testCaseName) {
    console.log('에너지 분석 수행 중...');

    const metadata = dataManager.currentMetadata;
    if (!metadata) {
        alert('데이터가 없습니다.');
        return;
    }

    // 전체 데이터셋의 통계 사용
    const avgTestEnergy = metadata.avgEnergyTest;
    const avgRefEnergy = metadata.avgEnergyRef;
    const totalFrames = metadata.totalFrames;

    // 실제 시간으로 변환 (분 -> 시간)
    const totalHours = totalFrames / 60;

    // 총 에너지 사용량 계산 (kJ -> kWh)
    const totalTestEnergy = (avgTestEnergy * totalFrames) / 3600; // kWh
    const totalRefEnergy = (avgRefEnergy * totalFrames) / 3600; // kWh

    const diff = totalTestEnergy - totalRefEnergy;
    const diffPercent = totalRefEnergy !== 0 ? ((diff / totalRefEnergy) * 100).toFixed(1) : '0';

    const season = dataManager.currentSeason === 'summer' ? '여름' : '겨울';

    // alert(`에너지 분석 완료!\n\n` +
    //     `케이스: ${testCaseName}\n` +
    //     `시즌: ${season}\n` +
    //     `기간: ${totalFrames.toLocaleString()}분 (${totalHours.toFixed(1)}시간)\n\n` +
    //     `Ref Zone 총 에너지: ${totalRefEnergy.toFixed(2)} kWh\n` +
    //     `Test Zone 총 에너지: ${totalTestEnergy.toFixed(2)} kWh\n\n` +
    //     `차이: ${diff.toFixed(2)} kWh (${diff > 0 ? '+' : ''}${diffPercent}%)\n\n` +
    //     `현재 프레임의 데이터를 보려면 시간 슬라이더를 조정하세요.`);

    console.log('분석 완료:', {
        testCase: testCaseName,
        season,
        totalTestEnergy,
        totalRefEnergy,
        diff,
        diffPercent
    });
}


// ============================================
// 시각화 업데이트 함수
// ============================================
async function updateVisualization(minute) {
    console.log(`📊 updateVisualization 호출 - minute: ${minute}`);

    const frameData = await dataManager.getFrameByIndex(minute);

    if (!frameData) {
        console.warn(`⚠️ No data for minute ${minute}`);
        return;
    }

    console.log(`   frameData 로드 완료 - time: ${frameData.time}`);

    // IFC 색상 업데이트 (동기 함수로 즉시 실행)
    updateIFCColors(frameData);

    // UI 정보 업데이트
    updateEnergyDisplay(frameData);
    updateTimeDisplay(frameData.time, minute);

    console.log(`✅ updateVisualization 완료`);
}

function updateIFCColors(frameData) {
    console.log('🎨 updateIFCColors 호출됨');
    console.log('   ifcModel:', ifcModel ? '존재' : '없음');
    console.log('   currentModelID:', currentModelID);

    // IFC 모델이 로드되지 않았으면 조용히 return (초기화 중일 수 있음)
    if (!ifcModel || currentModelID === null) {
        console.warn('⚠️ IFC 모델이 로드되지 않았습니다. 색상 적용 건너뜀');
        return;
    }

    const testEnergy = frameData.Qsens_test || 0;
    const refEnergy = frameData.Qsens_ref || 0;

    // 차이값 계산 (부호 포함)
    const diff = testEnergy - refEnergy;

    console.log(`   testEnergy: ${testEnergy.toFixed(2)}, refEnergy: ${refEnergy.toFixed(2)}, diff: ${diff.toFixed(2)}`);

    // 부호 있는 차이값 기준 색상 (-300 ~ +300)
    // 음수(파랑) = Test가 Ref보다 에너지 적게 사용
    // 양수(빨강) = Test가 Ref보다 에너지 많이 사용
    const simulationColor = getColorFromSignedDifference(diff, globalMaxDiff);

    console.log(`   색상: ${simulationColor.getHexString()}`);

    // Test Cell 요소들(346, 1997, 404, 381)에 색상 적용 , 1502, 1362, 1373, 1348
    const targetElements = [346, 1997, 404, 381];
    try {
        applyColorToElements(targetElements, simulationColor, 0.7);
        console.log(`✅ ExpressID ${targetElements.join(', ')}에 색상 적용 완료`);
    } catch (error) {
        console.error('❌ Color application error:', error);
    }
}

// 선택된 요소 초기화 함수 (콘솔에서 호출 가능)
function clearSelectedElements() {
    const count = selectedElementsForSimulation.size;
    selectedElementsForSimulation.clear();
    console.log(`✨ 선택된 요소 ${count}개가 초기화되었습니다.`);
    console.log('이제 기본 요소들(346, 1997, 404, 381)에 색상이 적용됩니다.');
}

// 전역에서 호출 가능하도록 window 객체에 추가
window.clearSelectedElements = clearSelectedElements;

// 바닥 그리드 및 텍스트 라벨 추가
function addFloorGridAndLabels() {
    if (floorGridAdded) return; // 이미 추가되었으면 리턴

    // 1. GridHelper로 바둑판 모양 그리드 추가
    const gridSize = 30;
    const divisions = 30;
    const gridHelper = new THREE.GridHelper(
        gridSize, // 그리드 크기
        divisions, // 칸 개수 (30x30)
        0xbbbbbb, // 중앙선 색상 (연한 회색으로 통일)
        0xbbbbbb // 그리드 선 색상 (연한 회색)
    );
    gridHelper.position.y = -0.05; // 바닥보다 약간 아래
    scene.add(gridHelper);

    // 2. 텍스트 스프라이트 생성 함수
    function createTextSprite(text, fontSize = 48) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // 배경 (반투명 흰색)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.roundRect(0, 0, canvas.width, canvas.height, 10);
        ctx.fill();

        // 테두리
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 4;
        ctx.roundRect(0, 0, canvas.width, canvas.height, 10);
        ctx.stroke();

        // 텍스트
        ctx.fillStyle = '#2c3e50';
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(4, 2, 1);

        return sprite;
    }

    // 3. "Test Zone" 라벨 (좌측)
    const testZoneLabel = createTextSprite('Test Zone');
    testZoneLabel.position.set(-4, 1.2, 15); // 좌측 배치
    scene.add(testZoneLabel);

    // 4. "Ref Zone" 라벨 (우측)
    const refZoneLabel = createTextSprite('Ref Zone');
    refZoneLabel.position.set(13.5, 1.2, 15); // 우측 배치
    scene.add(refZoneLabel);

    floorGridAdded = true;
    console.log('✅ 바닥 그리드 및 Zone 라벨 추가 완료');
}

// Canvas의 roundRect polyfill (구형 브라우저 호환)
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        this.beginPath();
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.arcTo(x + w, y, x + w, y + r, r);
        this.lineTo(x + w, y + h - r);
        this.arcTo(x + w, y + h, x + w - r, y + h, r);
        this.lineTo(x + r, y + h);
        this.arcTo(x, y + h, x, y + h - r, r);
        this.lineTo(x, y + r);
        this.arcTo(x, y, x + r, y, r);
        this.closePath();
        return this;
    };
}

// Material 재사용 함수 (메모리 최적화)
function getMaterial(color, opacity) {
    const colorHex = typeof color === 'number' ? color : color.getHex();
    const key = `${colorHex}_${opacity.toFixed(2)}`;

    if (!materialCache.has(key)) {
        materialCache.set(key, new THREE.MeshLambertMaterial({
            color: new THREE.Color(colorHex),
            transparent: opacity < 1.0,
            opacity: opacity
        }));
    }

    return materialCache.get(key);
}

function applyColorToElements(elementIds, color, opacity = 1.0) {
    console.log(`   🖌️ applyColorToElements 호출 - IDs: ${elementIds}, opacity: ${opacity}`);

    if (!ifcModel || currentModelID === null) {
        console.warn('   ⚠️ applyColorToElements: IFC 모델이 없습니다');
        return;
    }

    const material = getMaterial(color, opacity);
    console.log(`   Material 생성 완료`);

    // 각 요소에 대해 개별적으로 subset 생성 (고유 customID 사용)
    elementIds.forEach(id => {
        try {
            console.log(`   ExpressID ${id}에 createSubset 호출 시도...`);
            const result = ifcLoader.ifcManager.createSubset({
                modelID: currentModelID,
                ids: [id],
                material: material,
                scene,
                customID: `element-${id}`, // 각 요소마다 고유 ID
                removePrevious: false // 다른 요소의 subset 유지
            });
            console.log(`   ✅ ExpressID ${id} createSubset 완료`, result);
        } catch (error) {
            console.error(`   ❌ ExpressID ${id} createSubset 실패:`, error);
        }
    });
}

function updateEnergyDisplay(frameData) {
    const testEnergy = frameData.Qsens_test || 0;
    const refEnergy = frameData.Qsens_ref || 0;

    // 에너지 값 표시 (없으면 생성)
    let testEnergyEl = document.getElementById('test-energy');
    let refEnergyEl = document.getElementById('ref-energy');
    let energyDiffEl = document.getElementById('energy-diff');
    let energyDiffPercentEl = document.getElementById('energy-diff-percent');

    // 에너지 값을 전체 소수점으로 표시 (정확한 차이 확인)
    if (testEnergyEl) testEnergyEl.textContent = testEnergy.toString();
    if (refEnergyEl) refEnergyEl.textContent = refEnergy.toString();

    const diff = testEnergy - refEnergy;
    const diffPercent = refEnergy !== 0 ? (diff / refEnergy * 100).toFixed(2) : '0';

    if (energyDiffEl) {
        energyDiffEl.textContent = diff.toString();
        // 양수면 빨간색, 음수면 파란색
        energyDiffEl.style.color = diff > 0 ? '#e74c3c' : (diff < 0 ? '#3498db' : '#2c3e50');
    }
    if (energyDiffPercentEl) {
        energyDiffPercentEl.textContent = `(${diff > 0 ? '+' : ''}${diffPercent}%)`;
        energyDiffPercentEl.style.color = diff > 0 ? '#e74c3c' : (diff < 0 ? '#3498db' : '#7f8c8d');
    }
}

function updateTimeDisplay(timeStr, minute) {
    // 시간 및 날짜 표시 업데이트
    const dateDisplayEl = document.getElementById('current-date-display');
    const timeDisplayEl = document.getElementById('current-time-display');
    const minuteDisplayEl = document.getElementById('current-minute-display');

    let displayDate = '';
    let displayTime = '';
    let currentHour = 0;
    let currentMinute = 0;

    if (timeStr) {
        const timeString = timeStr.toString();

        if (timeString.includes(' ')) {
            // "2025-08-01 07:30:00" 형식
            const [datePart, timePart] = timeString.split(' ');
            displayDate = datePart;
            const timeParts = timePart.split(':');
            displayTime = `${timeParts[0]}:${timeParts[1]}`;
            currentHour = parseInt(timeParts[0]);
            currentMinute = parseInt(timeParts[1]);
        } else {
            // "07:30:00" 형식 (날짜 없음)
            const timeParts = timeString.split(':');
            displayTime = timeParts.length >= 2 ? `${timeParts[0]}:${timeParts[1]}` : timeString;
            currentHour = parseInt(timeParts[0]);
            currentMinute = parseInt(timeParts[1]);
            // 날짜 정보가 없으면 메타데이터에서 가져오기
            const metadata = dataManager.currentMetadata;
            if (metadata && metadata.startDate) {
                displayDate = metadata.startDate;
            }
        }

        if (dateDisplayEl && displayDate) {
            dateDisplayEl.textContent = displayDate;
        }

        if (timeDisplayEl && displayTime) {
            timeDisplayEl.textContent = displayTime;
        }

        // 일별 슬라이더 동기화
        syncDailySlider(displayDate, currentHour, currentMinute, minute);
    }

    if (minuteDisplayEl) {
        // 필터링된 범위를 퍼센트로 표시
        const totalFiltered = filteredIndices.length;
        const currentPos = currentFilteredIndex + 1;
        const percentage = totalFiltered > 0 ? ((currentPos / totalFiltered) * 100).toFixed(1) : 0;
        minuteDisplayEl.textContent = `진행률: ${percentage}%`;
    }
}

// ============================================
// 날짜 선택 관련 함수
// ============================================

// 날짜 범위에서 날짜 목록 생성
function generateDateList(startDateStr, endDateStr) {
    const dates = [];
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    let current = new Date(start);
    while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

// 날짜 셀렉트박스 채우기
async function populateDateSelects() {
    const metadata = dataManager.currentMetadata;
    if (!metadata || !metadata.startTime || !metadata.endTime) {
        console.log('⚠ 메타데이터가 없어 날짜 목록을 생성할 수 없습니다.');
        return;
    }

    // 시작/종료 날짜에서 날짜 부분만 추출
    const startDate = metadata.startTime.split(' ')[0];
    const endDate = metadata.endTime.split(' ')[0];

    console.log(`📅 날짜 범위: ${startDate} ~ ${endDate}`);

    // 날짜 목록 생성
    availableDates = generateDateList(startDate, endDate);

    if (availableDates.length === 0) {
        console.log('⚠ 생성된 날짜가 없습니다.');
        return;
    }

    console.log(`✓ 총 ${availableDates.length}일의 날짜 생성 완료`);

    // 첫 번째 날짜를 기본 선택
    selectedDate = availableDates[0];

    // 월 셀렉트박스 채우기 (고유한 월만)
    const months = [...new Set(availableDates.map(d => d.getMonth() + 1))];
    const monthSelect = document.getElementById('month-select');

    if (monthSelect) {
        monthSelect.innerHTML = '';
        months.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = `${month}월`;
            monthSelect.appendChild(option);
        });

        // 첫 번째 월 선택 및 일 업데이트
        monthSelect.value = selectedDate.getMonth() + 1;
    }

    updateDaySelect();
}

// 일 셀렉트박스 업데이트
function updateDaySelect() {
    const monthSelect = document.getElementById('month-select');
    const daySelect = document.getElementById('day-select');

    if (!monthSelect || !daySelect) return;

    const selectedMonth = parseInt(monthSelect.value);

    // 선택된 월의 날짜들만 필터링
    const daysInMonth = availableDates.filter(d => d.getMonth() + 1 === selectedMonth);

    daySelect.innerHTML = '';
    daysInMonth.forEach(date => {
        const option = document.createElement('option');
        option.value = date.toISOString().split('T')[0];
        option.textContent = `${date.getDate()}일`;
        daySelect.appendChild(option);
    });

    // 첫 번째 날짜 선택
    if (daysInMonth.length > 0) {
        daySelect.value = daysInMonth[0].toISOString().split('T')[0];
        onDateSelected();
    }
}

// 날짜 선택 이벤트 핸들러
async function onDateSelected() {
    const daySelect = document.getElementById('day-select');
    if (!daySelect) return;

    const selectedDateStr = daySelect.value;
    selectedDate = new Date(selectedDateStr);

    console.log(`📅 선택된 날짜: ${selectedDateStr}`);

    // 선택된 날짜의 07:00-20:00 범위 찾기
    await findDailyTimeRange();

    // 전체 슬라이더를 해당 날짜 시작 위치로 이동
    await syncMainSliderToSelectedDate();

    // 일별 슬라이더 초기화
    const dailySlider = document.getElementById('daily-time-slider');
    if (dailySlider) {
        dailySlider.value = 0;
        updateDailyDisplay(0);
    }
}

// 선택된 날짜의 시간 범위 찾기
// Test Zone 사용시간 범위 파싱
function getTestTimeRange() {
    const testTimeSelect = document.getElementById('test-time');
    if (!testTimeSelect) return { startHour: 7, endHour: 20 };

    const timeRange = testTimeSelect.value; // "07-18" 형식
    const [startHour, endHour] = timeRange.split('-').map(h => parseInt(h));
    return { startHour, endHour };
}

async function findDailyTimeRange() {
    const targetDateStr = selectedDate.toISOString().split('T')[0];
    const metadata = dataManager.currentMetadata;

    if (!metadata) return;

    const numChunks = metadata.numChunks;
    const chunkSize = metadata.chunkSize;

    // 전체 재생 모드일 때는 00:00-23:59, 아니면 사용시간 범위 사용
    let startHour, endHour;
    if (playFullRange) {
        startHour = 0;
        endHour = 23; // 23:59까지 (1440분)
    } else {
        const timeRange = getTestTimeRange();
        startHour = timeRange.startHour;
        endHour = timeRange.endHour;
    }

    let startIndex = -1;
    let endIndex = -1;

    console.log(`⏳ ${targetDateStr}의 ${startHour.toString().padStart(2, '0')}:00-${endHour.toString().padStart(2, '0')}:59 범위 검색 중...`);

    // 모든 청크를 순회하며 해당 날짜의 시작/종료 시간 찾기
    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
        const chunk = await dataManager.loadChunk(chunkIdx, true); // skipCache
        if (!chunk || !chunk.data) continue;

        for (let localIdx = 0; localIdx < chunk.data.length; localIdx++) {
            const frame = chunk.data[localIdx];
            const globalIdx = chunkIdx * chunkSize + localIdx;

            if (globalIdx >= totalMinutes) break;

            if (frame && frame.time) {
                const timeString = frame.time.toString();
                let datepart, timepart;

                if (timeString.includes(' ')) {
                    [datepart, timepart] = timeString.split(' ');
                } else {
                    // 시간만 있는 경우 메타데이터의 startDate 사용
                    datepart = metadata.startDate;
                    timepart = timeString;
                }

                if (datepart === targetDateStr) {
                    const hour = parseInt(timepart.split(':')[0]);
                    const minute = parseInt(timepart.split(':')[1]);

                    // 시작 시간 찾기
                    if (hour === startHour && minute === 0 && startIndex === -1) {
                        startIndex = globalIdx;
                    }

                    // 종료 시간 찾기
                    if (playFullRange) {
                        // 전체 재생 모드: 다음 날 00:00 직전까지 (23:59)
                        if (hour === 23 && minute === 59) {
                            endIndex = globalIdx;
                        } else if (hour === endHour && minute === 59) {
                            endIndex = globalIdx;
                        }
                        // 다음 날짜로 넘어가면 종료
                        const nextDate = new Date(targetDateStr);
                        nextDate.setDate(nextDate.getDate() + 1);
                        const nextDateStr = nextDate.toISOString().split('T')[0];
                        if (datepart === nextDateStr && hour === 0 && minute === 0) {
                            // 다음 날 00:00이면 이전 인덱스가 마지막
                            if (endIndex === -1 && globalIdx > 0) {
                                endIndex = globalIdx - 1;
                            }
                            chunkIdx = numChunks;
                            break;
                        }
                    } else {
                        // 필터링 모드: 기존 로직
                        if (hour === endHour && minute === 0) {
                            endIndex = globalIdx;
                            chunkIdx = numChunks;
                            break;
                        }
                    }
                }
            }
        }
    }

    if (startIndex !== -1 && endIndex !== -1) {
        dailyStartIndex = startIndex;
        dailyEndIndex = endIndex;
        const duration = endIndex - startIndex + 1; // +1로 마지막 분 포함

        if (playFullRange) {
            // 전체 재생 모드: 하루 전체 (1440분)로 설정
            const dailySlider = document.getElementById('daily-time-slider');
            if (dailySlider) {
                dailySlider.max = 1439; // 0~1439 (1440분)
            }
            console.log(`✓ 날짜 범위 찾음 (전체): ${startIndex} ~ ${endIndex} (1440 분)`);
        } else {
            const dailySlider = document.getElementById('daily-time-slider');
            if (dailySlider) {
                dailySlider.max = duration;
            }
            console.log(`✓ 날짜 범위 찾음: ${startIndex} ~ ${endIndex} (${duration} 분)`);
        }

        // 헤더 텍스트 업데이트
        updateDailySliderHeader(startHour, endHour);
    } else {
        console.warn(`⚠ ${targetDateStr}의 ${startHour.toString().padStart(2, '0')}:00-${endHour.toString().padStart(2, '0')}:59 범위를 찾을 수 없습니다.`);
    }
}

// 전체 슬라이더를 선택된 날짜의 시작 위치로 동기화
async function syncMainSliderToSelectedDate() {
    if (dailyStartIndex === -1) {
        console.warn('⚠️ dailyStartIndex가 설정되지 않았습니다.');
        return;
    }

    // filteredIndices 배열에서 dailyStartIndex의 위치 찾기
    const filteredIndex = filteredIndices.indexOf(dailyStartIndex);

    if (filteredIndex !== -1) {
        // 전체 슬라이더 업데이트
        const timeSlider = document.getElementById('time-slider');
        if (timeSlider) {
            currentFilteredIndex = filteredIndex;
            timeSlider.value = filteredIndex;
            currentMinute = dailyStartIndex;

            // 재생 중이면 정지
            if (isPlaying) {
                stopPlayback();
            }

            // 시각화 업데이트
            await updateVisualization(dailyStartIndex);

            console.log(`✓ 전체 슬라이더를 선택된 날짜 시작 위치로 이동: 인덱스 ${filteredIndex} (분 ${dailyStartIndex})`);
        }
    } else {
        console.warn(`⚠️ filteredIndices에서 dailyStartIndex(${dailyStartIndex})를 찾을 수 없습니다.`);
    }
}

// 일별 슬라이더 헤더 업데이트
function updateDailySliderHeader(startHour, endHour) {
    // const headerElement = document.querySelector('.time-slider-container h4');
    // if (headerElement) {
    //     const startStr = startHour.toString().padStart(2, '0');
    //     const endStr = endHour.toString().padStart(2, '0');
    //     headerElement.textContent = `⏰ 일별 시간대 슬라이더 (${startStr}:00 - ${endStr}:00)`;
    // }
}

// 일별 슬라이더 표시 업데이트
async function updateDailyDisplay(minuteOffset) {
    let globalIdx;

    if (playFullRange) {
        // 전체 재생 모드: dailyStartIndex부터 minuteOffset만큼 더함
        globalIdx = dailyStartIndex + minuteOffset;
    } else {
        // 필터링 모드: 기존 로직
        globalIdx = dailyStartIndex + minuteOffset;
    }

    if (globalIdx > dailyEndIndex || globalIdx >= totalMinutes) return;

    // 해당 인덱스의 데이터 가져오기
    const chunkIdx = Math.floor(globalIdx / 1440);
    const localIdx = globalIdx % 1440;

    const chunk = await dataManager.loadChunk(chunkIdx);

    if (chunk && chunk.data && chunk.data[localIdx]) {
        const frame = chunk.data[localIdx];

        // 날짜 및 시간 표시
        const dateDisplayEl = document.getElementById('daily-date-display');
        const timeDisplayEl = document.getElementById('daily-time-display');
        const minuteDisplayEl = document.getElementById('daily-minute-display');

        if (frame.time) {
            const timeString = frame.time.toString();
            let displayDate = '';
            let displayTime = '';

            if (timeString.includes(' ')) {
                const [datePart, timePart] = timeString.split(' ');
                displayDate = datePart;
                const [hour, minute] = timePart.split(':');
                displayTime = `${hour}:${minute}`;
            } else {
                const [hour, minute] = timeString.split(':');
                displayTime = `${hour}:${minute}`;
                const metadata = dataManager.currentMetadata;
                if (metadata && metadata.startDate) {
                    displayDate = metadata.startDate;
                }
            }

            if (dateDisplayEl && displayDate) dateDisplayEl.textContent = displayDate;
            if (timeDisplayEl && displayTime) timeDisplayEl.textContent = displayTime;
        }

        if (minuteDisplayEl) {
            const maxMinutes = playFullRange ? 1440 : (dailyEndIndex - dailyStartIndex + 1);
            const percentage = maxMinutes > 0 ? ((minuteOffset / maxMinutes) * 100).toFixed(1) : 0;
            minuteDisplayEl.textContent = `진행률: ${percentage}%`;
        }

        // IFC 뷰어 색상 업데이트
        updateIFCColors(frame);
        updateEnergyDisplay(frame);
    }
}

// 전체 슬라이더와 일별 슬라이더 동기화
function syncDailySlider(currentDate, hour, minute, globalIndex) {
    const daySelect = document.getElementById('day-select');
    const monthSelect = document.getElementById('month-select');
    const dailySlider = document.getElementById('daily-time-slider');
    const dailyDateDisplay = document.getElementById('daily-date-display');
    const dailyTimeDisplay = document.getElementById('daily-time-display');
    const dailyMinuteDisplay = document.getElementById('daily-minute-display');

    if (!daySelect || !monthSelect || !dailySlider) return;

    // 현재 날짜가 선택된 날짜와 다르면 자동으로 날짜 변경
    if (currentDate && selectedDate) {
        const currentDateStr = currentDate;
        const selectedDateStr = selectedDate.toISOString().split('T')[0];

        if (currentDateStr !== selectedDateStr) {
            // 날짜가 변경되었으므로 셀렉트박스 업데이트
            const newDate = new Date(currentDateStr);
            const newMonth = newDate.getMonth() + 1;
            const newDay = newDate.getDate();

            // 월이 다르면 월 셀렉트박스도 변경
            if (parseInt(monthSelect.value) !== newMonth) {
                monthSelect.value = newMonth;
                updateDaySelect(); // 일 목록 업데이트
            }

            // 일 셀렉트박스 변경 (이벤트 발생 방지)
            if (daySelect.value !== currentDateStr) {
                // 이벤트 리스너 일시 제거
                const dayChangeHandler = daySelect._changeHandler;
                if (dayChangeHandler) {
                    daySelect.removeEventListener('change', dayChangeHandler);
                }

                daySelect.value = currentDateStr;
                selectedDate = newDate;

                // 이벤트 리스너 다시 추가
                if (dayChangeHandler) {
                    daySelect.addEventListener('change', dayChangeHandler);
                }

                // 날짜가 변경되었으므로 범위 재검색
                findDailyTimeRange().then(() => {
                    updateDailySliderPosition(hour, minute);
                });
                return;
            }
        }
    }

    // 같은 날짜면 시간만 업데이트
    updateDailySliderPosition(hour, minute);
}

// 일별 슬라이더 위치 업데이트
function updateDailySliderPosition(hour, minute) {
    const dailySlider = document.getElementById('daily-time-slider');
    const dailyTimeDisplay = document.getElementById('daily-time-display');
    const dailyDateDisplay = document.getElementById('daily-date-display');
    const dailyMinuteDisplay = document.getElementById('daily-minute-display');

    if (!dailySlider) return;

    if (playFullRange) {
        // 전체 재생 모드: 00:00-23:59 전체 범위
        // 00:00부터의 분 단위 오프셋 계산
        const minutesFromMidnight = hour * 60 + minute;
        const maxMinutes = parseInt(dailySlider.max);

        if (minutesFromMidnight >= 0 && minutesFromMidnight <= maxMinutes) {
            dailySlider.value = minutesFromMidnight;

            // 디스플레이 업데이트
            if (dailyTimeDisplay) {
                const hourStr = hour.toString().padStart(2, '0');
                const minuteStr = minute.toString().padStart(2, '0');
                dailyTimeDisplay.textContent = `${hourStr}:${minuteStr}`;
            }

            if (dailyDateDisplay && selectedDate) {
                dailyDateDisplay.textContent = selectedDate.toISOString().split('T')[0];
            }

            if (dailyMinuteDisplay) {
                const percentage = maxMinutes > 0 ? ((minutesFromMidnight / (maxMinutes + 1)) * 100).toFixed(1) : 0;
                dailyMinuteDisplay.textContent = `진행률: ${percentage}%`;
            }

            // 슬라이더 활성화
            dailySlider.style.opacity = '1';
            dailySlider.disabled = false;
        } else {
            // 범위를 벗어난 경우
            dailySlider.style.opacity = '0.5';
        }
    } else {
        // 필터링 모드: 기존 로직 (07:00-20:00 범위 체크)
        const { startHour } = getTestTimeRange();
        const minHour = startHour;
        const maxHour = 20; // 기본 최대값

        if (hour >= minHour && hour <= maxHour) {
            // 시작 시간부터의 분 단위 오프셋 계산
            const minutesFromStart = (hour - minHour) * 60 + minute;

            // 슬라이더 범위 내에 있는지 확인
            const maxMinutes = parseInt(dailySlider.max);
            if (minutesFromStart >= 0 && minutesFromStart <= maxMinutes) {
                dailySlider.value = minutesFromStart;

                // 디스플레이 업데이트
                if (dailyTimeDisplay) {
                    const hourStr = hour.toString().padStart(2, '0');
                    const minuteStr = minute.toString().padStart(2, '0');
                    dailyTimeDisplay.textContent = `${hourStr}:${minuteStr}`;
                }

                if (dailyDateDisplay && selectedDate) {
                    dailyDateDisplay.textContent = selectedDate.toISOString().split('T')[0];
                }

                if (dailyMinuteDisplay) {
                    dailyMinuteDisplay.textContent = `분: ${minutesFromStart} / ${maxMinutes}`;
                }

                // 슬라이더 활성화
                dailySlider.style.opacity = '1';
                dailySlider.disabled = false;
            } else {
                // 범위를 벗어난 경우
                dailySlider.style.opacity = '0.5';
            }
        } else {
            // 범위 밖
            dailySlider.style.opacity = '0.5';
            if (dailyTimeDisplay) {
                dailyTimeDisplay.textContent = '범위 외';
            }
        }
    }
}

// ============================================
// 렌더링 루프
// ============================================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

// ============================================
// 요소 선택 기능 (마우스 클릭)
// ============================================
function onMouseClick(event) {
    console.log('🖱️ 클릭 이벤트 발생!');
    console.log('   ifcModel:', ifcModel ? '존재' : '없음');
    console.log('   currentModelID:', currentModelID);

    if (!ifcModel || currentModelID === null) {
        console.warn('⚠️ IFC 모델이 로드되지 않았습니다.');
        return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const meshes = [];
    scene.traverse((child) => {
        if (child.isMesh) {
            meshes.push(child);
        }
    });

    console.log(`   메시 개수: ${meshes.length}`);

    const intersects = raycaster.intersectObjects(meshes, true);
    console.log(`   교차된 객체 수: ${intersects.length}`);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        const object = intersect.object;

        if (object.modelID !== undefined) {
            try {
                const modelID = object.modelID;
                const expressID = ifcLoader.ifcManager.getExpressId(
                    object.geometry,
                    intersect.faceIndex
                );

                console.log(`   getExpressId 결과: ${expressID}`);

                if (expressID !== undefined && expressID !== null) {
                    selectedExpressID = expressID;
                    selectedObject = object;

                    // 선택된 요소를 시뮬레이션 색상 적용 대상에 추가
                    selectedElementsForSimulation.add(expressID);

                    // 콘솔에 ExpressID 출력
                    console.log(`🔍 선택된 요소 ExpressID: ${expressID}`);
                    console.log(`📋 시뮬레이션 대상 요소 목록:`, Array.from(selectedElementsForSimulation));

                    // 클릭한 요소를 파랑색으로 하이라이트
                    const highlightColor = new THREE.Color(0x0099ff); // 파랑색
                    const highlightMaterial = getMaterial(highlightColor, 0.8);

                    try {
                        ifcLoader.ifcManager.createSubset({
                            modelID: currentModelID,
                            ids: [expressID],
                            material: highlightMaterial,
                            scene,
                            removePrevious: true // ✅ 이전 subset 제거하고 새로 생성
                        });
                        console.log(`✨ 요소 ${expressID} 선택됨 (시뮬레이션 색상 적용 대상에 추가)`);
                    } catch (error) {
                        console.error('하이라이트 적용 실패:', error);
                    }

                    const expressIDEl = document.getElementById('selected-express-id');
                    if (expressIDEl) {
                        expressIDEl.textContent = `${expressID} (총 ${selectedElementsForSimulation.size}개 선택됨)`;
                        expressIDEl.style.backgroundColor = '#dcfce7';
                        expressIDEl.style.color = '#166534';
                        expressIDEl.style.borderColor = '#22c55e';
                    }
                }
            } catch (error) {
                console.error('❌ ExpressID 가져오기 실패:', error);
            }
        } else {
            console.log('   클릭된 객체에 modelID가 없습니다.');
        }
    } else {
        console.log('   클릭한 위치에 객체가 없습니다.');
    }
}

// 마우스 클릭 이벤트 리스너 등록 (초기화 함수에서 등록하도록 이동)
function registerClickEvent() {
    console.log('🔧 클릭 이벤트 리스너 등록 시도...');
    console.log('   renderer:', renderer ? '존재' : '없음');
    // console.log('   renderer.domElement:', renderer ? .domElement ? '존재' : '없음');

    if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('click', onMouseClick);
        console.log('✅ 클릭 이벤트 리스너 등록 완료!');
    } else {
        console.error('❌ renderer 또는 renderer.domElement가 없습니다!');
    }
}

// ============================================
// 테스트 색상 적용 기능
// ============================================
function applyTestColor() {
    if (!selectedExpressID || !currentModelID) {
        alert('먼저 뷰어에서 요소를 클릭하여 선택해주세요.');
        return;
    }

    // 랜덤 차이값 생성 (-300 ~ 300)
    const randomDiff = Math.random() * 600 - 300;
    const testColor = getColorFromSignedDifference(randomDiff, globalMaxDiff);

    try {
        ifcLoader.ifcManager.createSubset({
            modelID: currentModelID,
            ids: [selectedExpressID],
            material: new THREE.MeshLambertMaterial({
                color: testColor,
                transparent: true,
                opacity: 0.7
            }),
            scene,
            removePrevious: true
        });

        console.log(`✓ 테스트 색상 적용: ExpressID ${selectedExpressID}, 차이값: ${randomDiff.toFixed(1)} kJ/h`);
        alert(`테스트 색상 적용 완료!\nExpressID: ${selectedExpressID}\n차이값: ${randomDiff.toFixed(1)} kJ/h`);
    } catch (error) {
        console.error('테스트 색상 적용 실패:', error);
        alert('색상 적용에 실패했습니다. 콘솔을 확인해주세요.');
    }
}

// 특정 차이값으로 색상 적용
function applyDiffColor() {
    if (!selectedExpressID || !currentModelID) {
        alert('먼저 뷰어에서 요소를 클릭하여 선택해주세요.');
        return;
    }

    const diffInput = document.getElementById('test-diff-value');
    const diffValue = parseFloat(diffInput.value);

    if (isNaN(diffValue)) {
        alert('유효한 차이값을 입력해주세요.');
        return;
    }

    const testColor = getColorFromSignedDifference(diffValue, globalMaxDiff);

    try {
        ifcLoader.ifcManager.createSubset({
            modelID: currentModelID,
            ids: [selectedExpressID],
            material: new THREE.MeshLambertMaterial({
                color: testColor,
                transparent: true,
                opacity: 0.7
            }),
            scene,
            removePrevious: true
        });

        console.log(`✓ 차이값 색상 적용: ExpressID ${selectedExpressID}, 차이값: ${diffValue} kJ/h`);

        // 색상 정보 표시
        let colorInfo = '';
        if (diffValue < 0) {
            colorInfo = '파랑 (Test < Ref, 에너지 절감)';
        } else if (diffValue > 0) {
            colorInfo = '빨강 (Test > Ref, 에너지 증가)';
        } else {
            colorInfo = '흰색 (차이 없음)';
        }

        alert(`색상 적용 완료!\nExpressID: ${selectedExpressID}\n차이값: ${diffValue} kJ/h\n색상: ${colorInfo}`);
    } catch (error) {
        console.error('색상 적용 실패:', error);
        alert('색상 적용에 실패했습니다. 콘솔을 확인해주세요.');
    }
}

// 테스트 색상 초기화
function resetTestColor() {
    if (!selectedExpressID || !currentModelID) {
        alert('먼저 요소를 선택해주세요.');
        return;
    }

    try {
        // IFC Manager를 통해 서브셋 제거 (color-viewer.js 방식)
        ifcLoader.ifcManager.removeSubset(currentModelID, scene, [selectedExpressID]);

        console.log(`✓ 색상 초기화: ExpressID ${selectedExpressID}`);
        alert(`색상 초기화 완료!\nExpressID: ${selectedExpressID}`);
    } catch (error) {
        console.error('색상 초기화 실패:', error);
        alert('색상 초기화에 실패했습니다.');
    }
}

// 수동으로 ExpressID 입력하여 선택
function selectManualExpressID() {
    const manualInput = document.getElementById('manual-express-id');
    const expressID = parseInt(manualInput.value);

    if (isNaN(expressID)) {
        alert('유효한 ExpressID를 입력해주세요.');
        return;
    }

    selectedExpressID = expressID;

    // UI 업데이트
    const expressIDEl = document.getElementById('selected-express-id');
    if (expressIDEl) {
        expressIDEl.textContent = expressID;
        expressIDEl.style.backgroundColor = '#dcfce7';
        expressIDEl.style.color = '#166534';
        expressIDEl.style.borderColor = '#22c55e';
    }

    console.log(`✓ 수동 선택: ExpressID ${expressID}`);
    alert(`ExpressID ${expressID} 선택 완료!\n이제 색상을 적용할 수 있습니다.`);
}

// IFC 모델 상태 확인
function checkIFCStatus() {
    console.log('═══════════════════════════════════════');
    console.log('📊 IFC 모델 상태 확인');
    console.log('═══════════════════════════════════════');
    console.log('currentModelID:', currentModelID);
    console.log('ifcModel:', ifcModel);
    console.log('ifcLoader:', ifcLoader);
    console.log('scene.children 수:', scene.children.length);

    // scene의 children 확인
    console.log('\n🔍 Scene Children:');
    scene.children.forEach((child, index) => {
        console.log(`  [${index}] ${child.type}:`, child);
        if (child.modelID !== undefined) {
            console.log(`    → ModelID: ${child.modelID}`);
        }
    });

    // IFC 모델 찾기 시도
    let foundModel = null;
    scene.traverse((child) => {
        if (child.modelID !== undefined) {
            foundModel = child;
        }
    });

    console.log('\n🔍 찾은 IFC 모델:', foundModel);

    if (foundModel) {
        console.log('   ModelID:', foundModel.modelID);
        console.log('   Children 수:', foundModel.children.length);
    }

    console.log('\n💡 필터링된 인덱스 수:', filteredIndices.length);
    console.log('═══════════════════════════════════════');

    // 사용자에게 알림
    const status = ifcModel && currentModelID !== null ?
        `✅ IFC 모델 로드 완료!\n\nModelID: ${currentModelID}\nScene Children: ${scene.children.length}개\nIFC 요소: ${foundModel ? foundModel.children.length : 0}개` :
        `❌ IFC 모델이 로드되지 않았습니다!\n\nScene Children: ${scene.children.length}개\n\n콘솔을 확인하세요.`;

    alert(status);
}

// Test Cell 벽들에 직접 색상 적용 테스트
function testTargetWalls() {
    if (!currentModelID && currentModelID !== 0) {
        alert('IFC 모델이 로드되지 않았습니다.');
        return;
    }

    if (!ifcModel) {
        alert('IFC 모델이 로드되지 않았습니다.');
        return;
    }

    const testCellIds = [346, 1997, 404, 381];
    const colors = [
        { diff: -200, color: 'blue' },
        { diff: -100, color: 'lightblue' },
        { diff: 100, color: 'pink' },
        { diff: 200, color: 'red' }
    ];

    let successCount = 0;
    testCellIds.forEach((id, i) => {
        const { diff } = colors[i];
        const testColor = getColorFromSignedDifference(diff, globalMaxDiff);
        const material = getMaterial(testColor, 0.7);

        try {
            ifcLoader.ifcManager.createSubset({
                modelID: currentModelID,
                ids: [id],
                material: material,
                scene,
                removePrevious: true
            });
            successCount++;
        } catch (error) {
            // 에러 무시
        }
    });

    alert(`Test Cell 벽 색상 테스트 완료!\n성공: ${successCount}/${testCellIds.length}`);
}

// 테스트 버튼 이벤트 리스너
function registerTestButtons() {
    const testColorBtn = document.getElementById('test-color-btn');
    const resetTestColorBtn = document.getElementById('reset-test-color-btn');
    const applyDiffColorBtn = document.getElementById('apply-diff-color-btn');
    const applyManualIdBtn = document.getElementById('apply-manual-id-btn');
    const testTargetWallsBtn = document.getElementById('test-target-walls-btn');
    const checkIFCStatusBtn = document.getElementById('check-ifc-status-btn');

    if (testColorBtn) {
        testColorBtn.addEventListener('click', applyTestColor);
        console.log('✓ 테스트 색상 버튼 등록');
    }

    if (resetTestColorBtn) {
        resetTestColorBtn.addEventListener('click', resetTestColor);
        console.log('✓ 색상 초기화 버튼 등록');
    }

    if (applyDiffColorBtn) {
        applyDiffColorBtn.addEventListener('click', applyDiffColor);
        console.log('✓ 차이값 적용 버튼 등록');
    }

    if (applyManualIdBtn) {
        applyManualIdBtn.addEventListener('click', selectManualExpressID);
        console.log('✓ 수동 선택 버튼 등록');
    }

    if (testTargetWallsBtn) {
        testTargetWallsBtn.addEventListener('click', testTargetWalls);
        console.log('✓ Test Cell 벽 테스트 버튼 등록');
    }

    if (checkIFCStatusBtn) {
        checkIFCStatusBtn.addEventListener('click', checkIFCStatus);
        console.log('✓ IFC 상태 확인 버튼 등록');
    }
}

// ============================================
// 창 크기 조정 처리
// ============================================
window.addEventListener('resize', () => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
});

// ============================================
// 초기화 함수
// ============================================
async function initializeSimulator() {
    console.log('🚀 시뮬레이터 초기화 시작...');

    // Test Zone 초기값 설정 (기본 케이스: ref)
    const defaultCase = 'ref';
    const defaultCaseData = simulationCases[defaultCase];
    if (defaultCaseData) {
        document.getElementById('test-human').value = defaultCaseData.human;
        document.getElementById('test-equipment').value = defaultCaseData.equipment;
        document.getElementById('test-lighting').value = defaultCaseData.lighting;
        document.getElementById('test-outdoor').value = defaultCaseData.outdoor;
        document.getElementById('test-heating').value = defaultCaseData.heating;
        document.getElementById('test-cooling').value = defaultCaseData.cooling;
        document.getElementById('test-time').value = defaultCaseData.time;

        // 케이스 선택도 기본값으로 설정
        const testCaseSelect = document.getElementById('test-case');
        if (testCaseSelect) {
            testCaseSelect.value = defaultCase;
        }

        // 기본 케이스는 색상 없음 (모두 기본 스타일)
        updateInputColors(defaultCase);

        console.log('✓ Test Zone 초기값 설정 완료 (Ref 케이스)');
    }

    // 기본값: Ref + Summer 로드
    const metadata = await dataManager.loadMetadata('ref', 'summer');

    if (metadata) {
        totalMinutes = metadata.totalFrames;

        console.log(`✓ 데이터 로드 완료: ${totalMinutes.toLocaleString()} 프레임`);
        console.log(`   에너지 범위: ${metadata.minEnergyTest.toFixed(2)} ~ ${metadata.maxEnergyTest.toFixed(2)} kJ/h`);

        // Test Zone의 기본 사용 시간 값 읽기
        const testTimeSelect = document.getElementById('test-time');
        if (testTimeSelect) {
            timeRangeFilter = testTimeSelect.value; // 기본값: '07-18'
            console.log(`   재생 시간 범위: ${timeRangeFilter}`);
        }

        // 전체 재생 모드가 아닐 때만 필터링된 인덱스 생성
        if (!playFullRange) {
            await buildFilteredIndices();
        }

        // 시간 슬라이더 설정
        updateSliderRange();

        // 에너지 레전드 생성
        createEnergyLegend();

        console.log(`✓ 데이터 초기화 완료`);

        // 날짜 선택 이벤트 리스너 추가
        const monthSelect = document.getElementById('month-select');
        const daySelect = document.getElementById('day-select');

        if (monthSelect) {
            monthSelect.addEventListener('change', updateDaySelect);
        }

        if (daySelect) {
            // 이벤트 핸들러를 속성으로 저장 (나중에 제거/추가할 수 있도록)
            daySelect._changeHandler = onDateSelected;
            daySelect.addEventListener('change', onDateSelected);
        }

        // 일별 슬라이더 이벤트
        const dailySlider = document.getElementById('daily-time-slider');
        if (dailySlider) {
            dailySlider.addEventListener('input', (e) => {
                const minuteOffset = parseInt(e.target.value);
                updateDailyDisplay(minuteOffset);
            });
        }

        // 날짜 목록 생성
        await populateDateSelects();
    }

    // 테스트 버튼 이벤트 리스너 등록
    registerTestButtons();

    // 기본 IFC 파일 자동 로드 (완료될 때까지 대기)
    await loadDefaultIFCFile();

    // IFC 파일 로드 완료 후 클릭 이벤트 등록
    registerClickEvent();

    console.log(`✅ 시뮬레이터 초기화 완료 (IFC 모델 로드 완료)`);

    // 초기 로드 완료 - 수동 선택과 동일한 방식으로 준비됨
    console.log('💡 재생 버튼을 눌러 시뮬레이션을 시작하세요.');
}

// 기본 IFC 파일 자동 로드
async function loadDefaultIFCFile() {
    // 로딩 메시지 표시
    const viewerContainer = document.getElementById('viewer-container');
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-message';
    loadingDiv.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        color: #2c3e50;
        font-size: 16px;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.9);
        padding: 20px 40px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
    `;
    loadingDiv.innerHTML = `
        <div style="margin-bottom: 10px;">📂 IFC 파일 로딩 중...</div>
        <div style="font-size: 14px; color: #7f8c8d;">T-LAB_1126_re.ifc</div>
    `;
    viewerContainer.appendChild(loadingDiv);

    updateIFCModelStatus(false);

    try {
        const response = await fetch('/files/T-LAB_1126_re.ifc');

        if (!response.ok) {
            throw new Error(`IFC 파일을 찾을 수 없습니다. (HTTP ${response.status})`);
        }

        const blob = await response.blob();
        const file = new File([blob], 'T-LAB_1126_re.ifc', { type: 'application/x-step' });

        // 프로그레스바로 업데이트
        loadingDiv.innerHTML = `
            <div style="margin-bottom: 15px; font-size: 15px; font-weight: 600; color: #2c3e50;">
                📂 모델 초기화 중...
            </div>
            <div style="width: 250px; height: 6px; background: #ecf0f1; border-radius: 10px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">
                <div id="progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #3498db, #2ecc71); border-radius: 10px; transition: width 1.2s cubic-bezier(0.4, 0, 0.2, 1);"></div>
            </div>
            <div style="font-size: 13px; color: #95a5a6; margin-top: 10px; font-weight: 500;">
                T-LAB_1126_re.ifc
            </div>
        `;

        // 프로그레스 바 애니메이션 시작
        const progressBar = document.getElementById('progress-bar');
        if (progressBar) {
            setTimeout(() => progressBar.style.width = '100%', 100);
        }

        // Alert 없이 로드 (현재 방식 유지)
        await loadIFCFile(file, false);

        // 1초 후 완료 메시지 표시
        setTimeout(() => {
            if (loadingDiv && loadingDiv.parentNode) {
                loadingDiv.innerHTML = `
                    <div style="font-size: 16px; font-weight: 600; color: #27ae60;">
                        Loading complete!
                    </div>
                `;

                // 0.5초 후 페이드 아웃
                setTimeout(() => {
                    if (loadingDiv && loadingDiv.parentNode) {
                        loadingDiv.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
                        loadingDiv.style.opacity = '0';
                        loadingDiv.style.transform = 'scale(0.9)';

                        // 애니메이션 완료 후 제거
                        setTimeout(() => {
                            if (loadingDiv.parentNode) {
                                loadingDiv.parentNode.removeChild(loadingDiv);
                            }
                        }, 400);
                    }
                }, 600);
            }
        }, 1000);
    } catch (error) {
        updateIFCModelStatus(false);

        loadingDiv.innerHTML = `
            <div style="margin-bottom: 10px; color: #e74c3c;">⚠️ IFC 파일 로드 실패</div>
            <div style="font-size: 14px; color: #7f8c8d;">${error.message}</div>
            <div style="font-size: 12px; color: #95a5a6; margin-top: 8px;">수동으로 파일을 선택해주세요.</div>
        `;

        setTimeout(() => {
            if (loadingDiv && loadingDiv.parentNode) {
                loadingDiv.parentNode.removeChild(loadingDiv);
            }
        }, 5000);
    }
}

// 페이지 로드 시 초기화
window.addEventListener('DOMContentLoaded', () => {
    initializeSimulator();
});