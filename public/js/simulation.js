import { 
    applyPositionToElement, 
    applyColorToElement, 
    setElementVisibility,
    applyRotationToElement,
    applyScaleToElement,
    getCurrentModelID
} from '/js/viewer.js';

// 시뮬레이션 상태 관리
class SimulationController {
    constructor() {
        this.frames = []; // 시뮬레이션 프레임 데이터
        this.currentFrameIndex = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.playbackSpeed = 1.0; // 재생 속도 (1.0 = 정상 속도)
        this.animationId = null;
        this.lastUpdateTime = 0;
        this.currentTime = 0; // 현재 시뮬레이션 시간
        this.modelID = null;
        
        // UI 요소들
        this.playButton = null;
        this.pauseButton = null;
        this.stopButton = null;
        this.speedSlider = null;
        this.timeSlider = null;
        this.timeDisplay = null;
        
        this.onFrameChangeCallbacks = []; // 프레임 변경 콜백
    }

    // 시뮬레이션 데이터 로드
    loadSimulationData(data) {
        if (Array.isArray(data)) {
            this.frames = data;
            console.log(`시뮬레이션 데이터 로드 완료: ${this.frames.length}개 프레임`);
            
            // ModelID 자동 감지 (0도 유효한 ModelID이므로 명시적 체크)
            if (this.frames.length > 0 && this.frames[0].modelID !== undefined && this.frames[0].modelID !== null) {
                this.modelID = this.frames[0].modelID;
                console.log('시뮬레이션 데이터에서 ModelID 발견:', this.modelID);
            } else {
                this.modelID = getCurrentModelID();
                if (this.modelID !== null && this.modelID !== undefined) {
                    console.log('현재 로드된 모델의 ModelID 사용:', this.modelID);
                } else {
                    console.warn('ModelID를 찾을 수 없습니다. IFC 파일이 로드되면 자동으로 감지됩니다.');
                }
            }
            
            // UI 초기화
            this.initUI();
            
            return true;
        } else {
            console.error('시뮬레이션 데이터 형식이 올바르지 않습니다.');
            return false;
        }
    }

    // UI 초기화
    initUI() {
        const simControls = document.getElementById('simulation-controls');
        if (!simControls) {
            console.warn('시뮬레이션 컨트롤 UI를 찾을 수 없습니다.');
            return;
        }

        // 버튼 참조
        this.playButton = document.getElementById('sim-play-btn');
        this.pauseButton = document.getElementById('sim-pause-btn');
        this.stopButton = document.getElementById('sim-stop-btn');

        // 시간 슬라이더 설정
        this.timeSlider = document.getElementById('sim-time-slider');
        if (this.timeSlider) {
            this.timeSlider.max = Math.max(0, this.frames.length - 1);
            this.timeSlider.value = 0;
            this.timeSlider.disabled = this.frames.length === 0;
            this.timeSlider.addEventListener('input', (e) => {
                if (!this.isPlaying) {
                    this.goToFrame(parseInt(e.target.value));
                }
            });
        }

        // 시간 표시
        this.timeDisplay = document.getElementById('sim-time-display');
        this.updateTimeDisplay();

        // 재생 속도 슬라이더
        this.speedSlider = document.getElementById('sim-speed-slider');
        if (this.speedSlider) {
            this.speedSlider.addEventListener('input', (e) => {
                this.setPlaybackSpeed(parseFloat(e.target.value));
            });
        }
    }

    // 프레임 적용
    applyFrame(frame) {
        if (!frame) return;

        const { elementId, position, color, rotation, scale, visible, modelID } = frame;
        
        // ModelID 결정: 프레임의 modelID > 컨트롤러의 modelID > 현재 로드된 모델
        // ModelID는 0일 수 있으므로 null/undefined 체크만 수행
        let targetModelID = (modelID !== undefined && modelID !== null) ? modelID : this.modelID;
        
        console.log('프레임 적용 시작 - 프레임의 modelID:', modelID, '컨트롤러의 this.modelID:', this.modelID, 'targetModelID:', targetModelID);
        
        // ModelID가 없으면 현재 로드된 모델에서 가져오기 (0도 유효한 ModelID)
        if (targetModelID === null || targetModelID === undefined) {
            console.log('ModelID가 없어서 현재 모델에서 찾는 중...');
            targetModelID = getCurrentModelID();
            console.log('getCurrentModelID() 결과:', targetModelID);
            if (targetModelID !== null && targetModelID !== undefined) {
                this.modelID = targetModelID; // 캐시에 저장
                console.log('ModelID 자동 감지 및 저장:', targetModelID);
            }
        }

        // ModelID가 null/undefined인 경우만 에러 (0은 유효한 값)
        if (targetModelID === null || targetModelID === undefined) {
            console.warn('ModelID를 찾을 수 없습니다. IFC 파일이 로드되었는지 확인하세요. this.modelID:', this.modelID);
            return;
        }
        
        console.log('프레임 적용 - ModelID:', targetModelID, 'ExpressID:', elementId);

        // 위치 변경
        if (position) {
            applyPositionToElement(targetModelID, elementId, position.x, position.y, position.z);
        }

        // 색상 변경
        if (color) {
            applyColorToElement(targetModelID, elementId, color);
        }

        // 회전 변경
        if (rotation) {
            applyRotationToElement(targetModelID, elementId, rotation.x, rotation.y, rotation.z);
        }

        // 스케일 변경
        if (scale) {
            applyScaleToElement(targetModelID, elementId, scale.x, scale.y, scale.z);
        }

        // 가시성 변경
        if (visible !== undefined) {
            setElementVisibility(targetModelID, elementId, visible);
        }

        // 콜백 실행
        this.onFrameChangeCallbacks.forEach(callback => callback(frame));
    }

    // 특정 프레임으로 이동
    goToFrame(frameIndex) {
        if (frameIndex < 0 || frameIndex >= this.frames.length) {
            console.warn(`유효하지 않은 프레임 인덱스: ${frameIndex}`);
            return;
        }

        this.currentFrameIndex = frameIndex;
        const frame = this.frames[frameIndex];
        
        if (frame) {
            this.currentTime = frame.time || frameIndex;
            this.applyFrame(frame);
            
            // UI 업데이트
            if (this.timeSlider) {
                this.timeSlider.value = frameIndex;
            }
            this.updateTimeDisplay();
        }
    }

    // 재생 시작
    play() {
        if (this.isPlaying) return;
        
        if (this.frames.length === 0) {
            console.warn('시뮬레이션 데이터가 없습니다.');
            return;
        }

        this.isPlaying = true;
        this.isPaused = false;
        this.lastUpdateTime = performance.now();

        // UI 업데이트
        if (this.playButton) this.playButton.disabled = true;
        if (this.pauseButton) this.pauseButton.disabled = false;
        if (this.stopButton) this.stopButton.disabled = false;

        // 시뮬레이션 모드 활성화
        this.enterSimulationMode();

        // 애니메이션 루프 시작
        this.animate();
    }

    // 일시정지
    pause() {
        this.isPlaying = false;
        this.isPaused = true;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // UI 업데이트
        if (this.playButton) this.playButton.disabled = false;
        if (this.pauseButton) this.pauseButton.disabled = true;
    }

    // 정지
    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentFrameIndex = 0;
        this.currentTime = 0;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // 첫 프레임으로 이동
        this.goToFrame(0);

        // UI 업데이트
        if (this.playButton) this.playButton.disabled = false;
        if (this.pauseButton) this.pauseButton.disabled = false;
        if (this.stopButton) this.stopButton.disabled = true;
        
        // 시뮬레이션 모드 유지 (정지해도 모드는 유지)
    }

    // 애니메이션 루프
    animate() {
        if (!this.isPlaying) return;

        const now = performance.now();
        const deltaTime = (now - this.lastUpdateTime) * this.playbackSpeed;

        // 시간 기반 프레임 찾기
        if (this.frames.length > 0) {
            const currentFrame = this.frames[this.currentFrameIndex];
            const nextFrameIndex = this.currentFrameIndex + 1;

            if (nextFrameIndex < this.frames.length) {
                const nextFrame = this.frames[nextFrameIndex];
                const currentTime = currentFrame.time || this.currentFrameIndex;
                const nextTime = nextFrame.time || nextFrameIndex;

                // 시간 간격 계산 (밀리초)
                const timeStep = (nextTime - currentTime) * 1000 / this.playbackSpeed;

                if (deltaTime >= timeStep) {
                    this.currentFrameIndex = nextFrameIndex;
                    this.currentTime = nextFrame.time || nextFrameIndex;
                    this.applyFrame(nextFrame);

                    // UI 업데이트
                    if (this.timeSlider) {
                        this.timeSlider.value = this.currentFrameIndex;
                    }
                    this.updateTimeDisplay();
                    this.lastUpdateTime = now;

                    // 마지막 프레임이면 정지
                    if (this.currentFrameIndex >= this.frames.length - 1) {
                        this.stop();
                        return;
                    }
                }
            } else {
                // 마지막 프레임 도달
                this.stop();
                return;
            }
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    // 재생 속도 설정
    setPlaybackSpeed(speed) {
        this.playbackSpeed = Math.max(0.1, Math.min(5.0, speed));
        console.log(`재생 속도 변경: ${this.playbackSpeed}x`);

        if (this.speedSlider) {
            const speedDisplay = document.getElementById('sim-speed-display');
            if (speedDisplay) {
                speedDisplay.textContent = `${this.playbackSpeed.toFixed(1)}x`;
            }
        }
    }

    // 시간 표시 업데이트
    updateTimeDisplay() {
        if (this.timeDisplay) {
            const frame = this.frames[this.currentFrameIndex];
            if (frame) {
                const time = frame.time || this.currentFrameIndex;
                this.timeDisplay.textContent = `시간: ${time.toFixed(2)}s (프레임: ${this.currentFrameIndex + 1}/${this.frames.length})`;
            }
        }
    }

    // 프레임 변경 콜백 등록
    onFrameChange(callback) {
        if (typeof callback === 'function') {
            this.onFrameChangeCallbacks.push(callback);
        }
    }

    // 프레임 변경 콜백 제거
    offFrameChange(callback) {
        const index = this.onFrameChangeCallbacks.indexOf(callback);
        if (index > -1) {
            this.onFrameChangeCallbacks.splice(index, 1);
        }
    }

    // 시뮬레이션 모드 진입
    enterSimulationMode() {
        document.body.classList.add('simulation-mode');
        const toggleBtn = document.getElementById('simulation-mode-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = '일반 모드';
        }
    }

    // 시뮬레이션 모드 종료
    exitSimulationMode() {
        document.body.classList.remove('simulation-mode');
        const toggleBtn = document.getElementById('simulation-mode-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = '시뮬레이션 모드';
        }
    }

    // 시뮬레이션 모드 토글
    toggleSimulationMode() {
        if (document.body.classList.contains('simulation-mode')) {
            this.exitSimulationMode();
        } else {
            this.enterSimulationMode();
        }
    }
}

// 전역 시뮬레이션 컨트롤러 인스턴스
let simulationController = null;

// 시뮬레이션 컨트롤러 초기화
export function initSimulationController() {
    if (!simulationController) {
        simulationController = new SimulationController();
        // 전역에서 접근 가능하도록 설정 (ModelID 자동 설정용)
        window.simulationController = simulationController;
    }
    return simulationController;
}

// 시뮬레이션 컨트롤러 가져오기
export function getSimulationController() {
    if (!simulationController) {
        return initSimulationController();
    }
    return simulationController;
}

// 시뮬레이션 데이터 로드
export function loadSimulationData(data) {
    const controller = getSimulationController();
    return controller.loadSimulationData(data);
}

// 재생/일시정지/정지 함수들
export function playSimulation() {
    const controller = getSimulationController();
    controller.play();
}

export function pauseSimulation() {
    const controller = getSimulationController();
    controller.pause();
}

export function stopSimulation() {
    const controller = getSimulationController();
    controller.stop();
}

// 특정 프레임으로 이동
export function goToSimulationFrame(frameIndex) {
    const controller = getSimulationController();
    controller.goToFrame(frameIndex);
}

// 시뮬레이션 모드 토글
export function toggleSimulationMode() {
    const controller = getSimulationController();
    controller.toggleSimulationMode();
}

