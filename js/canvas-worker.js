importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.2', 'https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.0');
const init = async () => {
  net = await bodyPix.load({
    architecture: 'MobileNetV1',
    outputStride: 16,
    multiplier: 0.75,
    quantBytes: 2
  })
}
let net = null
let maskImg = null
init()

let offCanvas = null
let offCanvasContext = null
let offTmpCanvas = null
let offTmpCanvasContext = null

let videoMode = 0

this.onmessage = async evt => {
  const evtData = evt.data
  // console.log(evtData)

  switch (evtData.type) {
    case 'switchMode':
      videoMode = parseInt(evtData.data)
      break
    case 'offCanvas':
      // define offCanvas element
      offCanvas = evtData.canvas
      offCanvasContext = offCanvas.getContext('2d')
      offTmpCanvas = new OffscreenCanvas(offCanvas.width, offCanvas.height)
      offTmpCanvasContext = offTmpCanvas.getContext('2d')
      break
    case 'maskImg':
      // receive maskImg
      maskImg = evtData.maskImgBitmap
      break
    case 'videoBitMap':
      if (offCanvasContext === null || net === null) {
        break
      }
      const evtBitMap = evtData.bitMap
      // console.log(evtBitMap)

      switch (videoMode) {
        case 0:
          // normal type => return image directly
          offCanvasContext.drawImage(evtBitMap, 0, 0, evtBitMap.width, evtBitMap.height, 0, 0, 640, 360)
          break
        case 1: {
          const backgroundBlurAmount = 8

          offTmpCanvasContext.drawImage(evtBitMap, 0, 0, evtBitMap.width, evtBitMap.height, 0, 0, 640, 360)
          const segmentation = await net.segmentMultiPerson(offTmpCanvasContext.getImageData(0, 0, 640, 360), {
            internalResolution: 'medium',
            segmentationThreshold: 0.7,
            maxDetections: 3,
            scoreThreshold: 0.3,
            nmsRadius: 20,
          })
          // blur oriPic
          if (backgroundBlurAmount === 0) {
            offCanvasContext.drawImage(evtBitMap, 0, 0)
            return;
          } else {
            drawAndBlurImageOnCanvas(evtBitMap, backgroundBlurAmount, offCanvasContext);
          }
          if (Array.isArray(segmentation) && segmentation.length === 0) {
            // nobody exist on the cam
            return;
          }

          const foregroundColor = { r: 0, g: 0, b: 0, a: 255 }
          const backgroundColor = { r: 0, g: 0, b: 0, a: 0 }
          const backgroundDarkeningMask = bodyPix.toMask(
            segmentation, foregroundColor, backgroundColor
          )

          offTmpCanvasContext.putImageData(backgroundDarkeningMask, 0, 0)
          offTmpCanvasContext.globalCompositeOperation = 'source-in'
          offTmpCanvasContext.drawImage(evtBitMap, 0, 0)
          offTmpCanvasContext.globalCompositeOperation = 'source-over'
          offCanvasContext.drawImage(offTmpCanvas, 0, 0)
          break
        }
        case 2: {
          if (maskImg === null) {
            break
          }
          offTmpCanvasContext.drawImage(evtBitMap, 0, 0, evtBitMap.width, evtBitMap.height, 0, 0, 640, 360)
          const segmentation = await net.segmentMultiPerson(offTmpCanvasContext.getImageData(0, 0, 640, 360), {
            internalResolution: 'medium',
            segmentationThreshold: 0.7,
            maxDetections: 3,
            scoreThreshold: 0.3,
            nmsRadius: 20,
          })
          const foregroundColor = { r: 0, g: 0, b: 0, a: 0 }
          const backgroundColor = { r: 0, g: 0, b: 0, a: 255 }
          const backgroundDarkeningMask = bodyPix.toMask(
            segmentation, foregroundColor, backgroundColor
          )

          if (backgroundDarkeningMask !== null) {
            offCanvasContext.putImageData(backgroundDarkeningMask, 0, 0)
            offCanvasContext.globalCompositeOperation = 'source-in'
            offCanvasContext.drawImage(maskImg, 0, 0)
            offCanvasContext.globalCompositeOperation = 'destination-over'
            offCanvasContext.drawImage(evtBitMap, 0, 0, evtBitMap.width, evtBitMap.height, 0, 0, 640, 360)
            offCanvasContext.globalCompositeOperation = 'source-over'
          } else {
            offCanvasContext.drawImage(maskImg, 0, 0)
          }
          break
        }
      }
      break
    default:
      break
  }
}

function drawAndBlurImageOnCanvas(image, blurAmount, canvasContext) {
  const { height, width } = image;
  const ctx = canvasContext
  canvasContext.width = width;
  canvasContext.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  // judge whether it's on Safari
  if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
    cpuBlur(canvasContext, image, blurAmount);
  } else {
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(image, 0, 0, width, height);
  }
  ctx.restore();
}

function cpuBlur(canvasContext, image, blur) {
  const ctx = canvasContext;

  let sum = 0;
  const delta = 5;
  const alphaLeft = 1 / (2 * Math.PI * delta * delta);
  const step = blur < 3 ? 1 : 2;
  for (let y = -blur; y <= blur; y += step) {
    for (let x = -blur; x <= blur; x += step) {
      const weight =
        alphaLeft * Math.exp(-(x * x + y * y) / (2 * delta * delta));
      sum += weight;
    }
  }
  for (let y = -blur; y <= blur; y += step) {
    for (let x = -blur; x <= blur; x += step) {
      ctx.globalAlpha = alphaLeft *
        Math.exp(-(x * x + y * y) / (2 * delta * delta)) / sum * blur;
      ctx.drawImage(image, x, y);
    }
  }
  ctx.globalAlpha = 1;
}