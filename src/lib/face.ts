import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { VERSION } from './pose'

// On-device face tracking for tension and eyelid flutter. Blendshape scores only; video never leaves the phone.

let loading: Promise<FaceLandmarker> | null = null

export function loadFace(): Promise<FaceLandmarker> {
  if (!loading) {
    loading = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`)
      const make = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate,
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      })
      try { return await make('GPU') } catch { return await make('CPU') }
    })()
    loading.catch(() => { loading = null })
  }
  return loading
}

/** Blendshape scores by name, or null if no face was found. */
export function blendshapes(face: FaceLandmarker, video: HTMLVideoElement, tMs: number): Record<string, number> | null {
  const cats = face.detectForVideo(video, tMs).faceBlendshapes[0]?.categories
  if (!cats) return null
  const out: Record<string, number> = {}
  for (const c of cats) out[c.categoryName] = c.score
  return out
}
