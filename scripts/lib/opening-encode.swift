// PNG 연속 그림 → H.264 mp4. 애플 하드웨어 인코더를 쓴다 (내려받을 것 없음).
// 쓰기: encode <원본폴더> <장수> <폭> <높이> <초당장수> <비트레이트Mbps> <결과.mp4>
import AVFoundation
import AppKit
import CoreVideo

let a = CommandLine.arguments
guard a.count == 8 else { fputs("인자 수가 맞지 않습니다\n", stderr); exit(2) }
let src = URL(fileURLWithPath: a[1])
let n = Int(a[2])!, W = Int(a[3])!, H = Int(a[4])!, fps = Int(a[5])!
let mbps = Double(a[6])!
let out = URL(fileURLWithPath: a[7])
try? FileManager.default.removeItem(at: out)

let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let settings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: Int(mbps * 1_000_000),
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoAllowFrameReorderingKey: true,
    AVVideoMaxKeyFrameIntervalKey: fps * 2,
  ],
  // 색 범위를 **반드시 적어 둔다.** 안 적으면 받는 쪽이 제멋대로 해석해서
  // 그림이 통째로 어두워진다 (재 보니 9~10단계).
  AVVideoColorPropertiesKey: [
    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
  ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let attrs: [String: Any] = [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
]
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attrs)
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

// **원본 PNG 를 그대로 옮긴다.** macOS 는 태그 없는 PNG 를 Rec.709 로 보는데,
// sRGB 통에 그리면 감마 변환이 한 번 끼어서 그림 전체가 9단계 어두워진다(재 봄).
// 원본이 들고 있는 색공간을 그대로 쓰면 변환이 한 번도 안 일어난다.
let fallback = CGColorSpace(name: CGColorSpace.itur_709)!
var i = 0
let q = DispatchQueue(label: "enc")
let done = DispatchSemaphore(value: 0)

input.requestMediaDataWhenReady(on: q) {
  while input.isReadyForMoreMediaData {
    if i >= n { input.markAsFinished(); done.signal(); return }
    let f = src.appendingPathComponent(String(format: "anime%03d.png", i))
    guard let img = NSImage(contentsOf: f),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
      fputs("못 읽음: \(f.path)\n", stderr); exit(1)
    }
    var pbo: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pbo)
    guard let pb = pbo else { fputs("버퍼 없음\n", stderr); exit(1) }
    // 들어가는 그림에도 같은 표시를 붙인다 — 그래야 변환이 한 번도 안 일어난다
    CVBufferSetAttachment(pb, kCVImageBufferColorPrimariesKey,
                          kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(pb, kCVImageBufferTransferFunctionKey,
                          kCVImageBufferTransferFunction_ITU_R_709_2, .shouldPropagate)
    CVBufferSetAttachment(pb, kCVImageBufferYCbCrMatrixKey,
                          kCVImageBufferYCbCrMatrix_ITU_R_709_2, .shouldPropagate)
    CVPixelBufferLockBaseAddress(pb, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: W, height: H,
                        bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
                        space: cg.colorSpace ?? fallback, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
                                             | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.interpolationQuality = .high
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
    CVPixelBufferUnlockBaseAddress(pb, [])
    adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: CMTimeScale(fps)))
    if i % 50 == 0 { fputs("  \(i)/\(n)\n", stderr) }
    i += 1
  }
}
done.wait()
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fputs("실패: \(writer.error?.localizedDescription ?? "?")\n", stderr); exit(1) }
let mb = Double((try! FileManager.default.attributesOfItem(atPath: out.path)[.size] as! Int)) / 1_048_576
fputs(String(format: "다 됐습니다 — %@ %.1fMB\n", out.lastPathComponent, mb), stderr)
