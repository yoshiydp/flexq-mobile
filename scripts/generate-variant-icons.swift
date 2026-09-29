#!/usr/bin/env swift
//
// ビルドバリアント用のアプリアイコンを生成する (TASK-123)
//
// 素のアイコンの下部に帯を重ねて「STG」「Dev」を描き、ホーム画面で
// TestFlight / Play 内部テスト版（staging）と開発ビルド（dev）と
// 本番版を見分けられるようにする。
//
// 使い方:
//   swift scripts/generate-variant-icons.swift
//
// src/assets/images/ の icon.png / adaptive-icon.png から
// icon-stg.png / adaptive-icon-stg.png / icon-dev.png / adaptive-icon-dev.png
// を生成する。元画像を差し替えたら再実行すること。
//
// 帯の縦位置が iOS と Android で違うのは、Android のアダプティブアイコンが
// 前景画像の中央 66.7%（108dp 中 72dp）しか表示せず、外側が切り落とされるため。
// iOS は全面が見えるので下端に置ける。

import AppKit
import Foundation

let imagesDir = "src/assets/images"
let bandColor = NSColor(srgbRed: 0x11 / 255.0, green: 0x0C / 255.0, blue: 0x18 / 255.0, alpha: 1.0)
let textColor = NSColor(srgbRed: 0xFF / 255.0, green: 0xD7 / 255.0, blue: 0x00 / 255.0, alpha: 1.0)

/// 帯付きのアイコンを書き出す。
/// - bandTop / bandBottom: 画像の高さに対する割合（上端 0.0 / 下端 1.0）
func renderBadge(
  input: String, output: String, label: String,
  bandTop: CGFloat, bandBottom: CGFloat
) {
  guard let source = NSImage(contentsOfFile: input) else {
    FileHandle.standardError.write("cannot read \(input)\n".data(using: .utf8)!)
    exit(1)
  }
  let side = 1024
  let size = NSSize(width: side, height: side)

  guard
    let rep = NSBitmapImageRep(
      bitmapDataPlanes: nil, pixelsWide: side, pixelsHigh: side,
      bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
      colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
  else { exit(1) }
  rep.size = size

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

  source.draw(in: NSRect(origin: .zero, size: size))

  // AppKit の原点は左下なので、上端からの割合を下端からの座標に変換する
  let h = CGFloat(side)
  let bandHeight = (bandBottom - bandTop) * h
  let bandY = h - bandBottom * h
  let bandRect = NSRect(x: 0, y: bandY, width: h, height: bandHeight)
  bandColor.setFill()
  bandRect.fill()

  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  let fontSize = bandHeight * 0.62
  let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: fontSize, weight: .heavy),
    .foregroundColor: textColor,
    .paragraphStyle: paragraph,
    .kern: fontSize * 0.10,
  ]
  let text = NSAttributedString(string: label, attributes: attributes)
  // 大文字だけなので、実描画の高さを測って帯の中央に揃える
  let textSize = text.size()
  let textRect = NSRect(
    x: 0, y: bandY + (bandHeight - textSize.height) / 2.0,
    width: h, height: textSize.height)
  text.draw(in: textRect)

  NSGraphicsContext.restoreGraphicsState()

  guard let data = rep.representation(using: .png, properties: [:]) else { exit(1) }
  do {
    try data.write(to: URL(fileURLWithPath: output))
    print("wrote \(output)  (\(label))")
  } catch {
    FileHandle.standardError.write("write failed: \(error)\n".data(using: .utf8)!)
    exit(1)
  }
}

for (label, suffix) in [("STG", "stg"), ("Dev", "dev")] {
  // iOS: 全面が表示されるので下端に置く
  renderBadge(
    input: "\(imagesDir)/icon.png", output: "\(imagesDir)/icon-\(suffix).png",
    label: label, bandTop: 0.805, bandBottom: 1.0)
  // Android: 中央 66.7% しか表示されないため、切り落とされない位置に上げる
  renderBadge(
    input: "\(imagesDir)/adaptive-icon.png",
    output: "\(imagesDir)/adaptive-icon-\(suffix).png",
    label: label, bandTop: 0.655, bandBottom: 0.805)
}
