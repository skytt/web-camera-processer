let worker, videoInterval, renderCanvasReq, offscreen
const oriVideo = document.getElementById('oriVideo');
const canvasElt = document.getElementById('main-canvas');
const maskImg = document.getElementById('maskImg');


$(document).ready(function () {
  if (checkSupported()) {
    offscreen = canvasElt.transferControlToOffscreen();
    initCam();
    initWorker();
    switchVideoMode(0);
    initVideoStream();
  } else {
    alert('当前浏览器不支持离屏画布，无法运行！')
  }
});

function checkSupported() {
  if (canvasElt.transferControlToOffscreen) {
    return true
  }
  return false
}

function switchVideoMode(switchTo) {
  let text
  switch (switchTo) {
    case 0:
      text = '正常模式'
      break;
    case 1:
      text = '虚化背景'
      break;
    case 2:
      text = '图片背景'
      break;
    default:
      break;
  }
  document.getElementById('modetext').textContent = text

  if (worker) {
    worker.postMessage({ type: 'switchMode', data: switchTo });
  }
}

async function initCam() {
  await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { width: 640, height: 360, frameRate: 15 }
  }).then(stream => {
    audioTrack = stream.getAudioTracks()[0];
    oriVideo.srcObject = stream;
    oriVideo.play();
  });
}

function initWorker() {
  if (!worker) {
    worker = new Worker("./js/canvas-worker.js");
  }
  worker.postMessage({ type: 'offCanvas', canvas: offscreen }, [offscreen]);
  createImageBitmap(maskImg).then(res => {
    worker.postMessage({ type: 'maskImg', maskImgBitmap: res }, [res]);
  })
}

function initVideoStream() {
  oriVideo.addEventListener('play', async function () {
    const oriStream = oriVideo.captureStream();
    const [oriVideoTrack] = oriStream.getVideoTracks();
    const oriImageCapture = new ImageCapture(oriVideoTrack);

    let flag = true
    videoInterval = window.setInterval(async () => {
      if (!flag) {
        return
      }
      flag = false
      await oriImageCapture.grabFrame()
        .then(videoBitMap => {
          worker.postMessage({ type: 'videoBitMap', bitMap: videoBitMap }, [videoBitMap]);
          flag = true
        })
    }, 60);

    // async function renderCanvasImg() {
    //   await oriImageCapture.grabFrame()
    //     .then(videoBitMap => {
    //       // canvasEltx1.drawImage(videoBitMap, 0, 0, videoBitMap.width, videoBitMap.height, 0, 0, 640, 360)
    //       worker.postMessage({ type: 'videoBitMap', bitMap: videoBitMap }, [videoBitMap]);
    //     })
    //   renderCanvasReq = requestAnimationFrame(renderCanvasImg);
    // }
    // renderCanvasReq = requestAnimationFrame(renderCanvasImg);

  }, false);
  oriVideo.addEventListener('pause', function () { window.clearInterval(videoInterval); }, false);
  oriVideo.addEventListener('ended', function () { window.clearInterval(videoInterval); }, false);
}