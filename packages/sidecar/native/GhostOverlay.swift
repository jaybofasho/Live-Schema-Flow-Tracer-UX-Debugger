import Cocoa
import Foundation

// Custom View rendering the Ghost Mouse Pin, pulse halo, step badge, and coordinate tooltip
class GhostOverlayView: NSView {
    var pinX: CGFloat = -100
    var pinY: CGFloat = -100
    var stepNumber: Int = 1
    var labelText: String = "PAUSED"
    var timestampText: String = "00:00.000"
    var isVisiblePin: Bool = false
    var pulsePhase: CGFloat = 0.0
    var timer: Timer?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        self.wantsLayer = true
        startPulseAnimation()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        self.wantsLayer = true
        startPulseAnimation()
    }

    func startPulseAnimation() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            guard let self = self, self.isVisiblePin else { return }
            self.pulsePhase += 0.1
            if self.pulsePhase > CGFloat.pi * 2 {
                self.pulsePhase = 0
            }
            self.needsDisplay = true
        }
    }

    func setPin(x: CGFloat, y: CGFloat, step: Int, label: String, timestamp: String) {
        self.pinX = x
        self.pinY = y
        self.stepNumber = step
        self.labelText = label
        self.timestampText = timestamp
        self.isVisiblePin = true
        self.needsDisplay = true
    }

    func hidePin() {
        self.isVisiblePin = false
        self.needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard isVisiblePin else { return }

        guard let context = NSGraphicsContext.current?.cgContext else { return }

        // Coordinate conversion: macOS screens have origin at bottom-left, but OS screen points passed are usually top-left
        let screenHeight = self.bounds.height
        let convertedY = screenHeight - pinY
        let center = CGPoint(x: pinX, y: convertedY)

        context.saveGState()

        // 1. Draw outer animated glowing pulse rings
        let pulseRadius: CGFloat = 28.0 + (sin(pulsePhase) + 1.0) * 8.0
        let pulseAlpha: CGFloat = 0.45 - (sin(pulsePhase) + 1.0) * 0.15

        context.setFillColor(NSColor(red: 0.25, green: 0.55, blue: 1.0, alpha: pulseAlpha * 0.25).cgColor)
        context.fillEllipse(in: CGRect(x: center.x - pulseRadius * 1.4, y: center.y - pulseRadius * 1.4, width: pulseRadius * 2.8, height: pulseRadius * 2.8))

        context.setStrokeColor(NSColor(red: 0.15, green: 0.75, blue: 1.0, alpha: pulseAlpha).cgColor)
        context.setLineWidth(2.5)
        context.strokeEllipse(in: CGRect(x: center.x - pulseRadius, y: center.y - pulseRadius, width: pulseRadius * 2.0, height: pulseRadius * 2.0))

        // 2. Draw inner target reticle
        let innerRadius: CGFloat = 12.0
        context.setFillColor(NSColor(red: 0.08, green: 0.10, blue: 0.18, alpha: 0.9).cgColor)
        context.fillEllipse(in: CGRect(x: center.x - innerRadius, y: center.y - innerRadius, width: innerRadius * 2, height: innerRadius * 2))

        context.setStrokeColor(NSColor(red: 0.35, green: 0.85, blue: 1.0, alpha: 1.0).cgColor)
        context.setLineWidth(2.0)
        context.strokeEllipse(in: CGRect(x: center.x - innerRadius, y: center.y - innerRadius, width: innerRadius * 2, height: innerRadius * 2))

        // Center dot
        context.setFillColor(NSColor(red: 1.0, green: 0.35, blue: 0.45, alpha: 1.0).cgColor)
        context.fillEllipse(in: CGRect(x: center.x - 3, y: center.y - 3, width: 6, height: 6))

        // 3. Draw Info Badge (Step Counter + Status + Coordinates)
        let badgeOrigin = CGPoint(x: center.x + 22, y: center.y - 18)
        let badgeWidth: CGFloat = 190
        let badgeHeight: CGFloat = 52
        let badgeRect = CGRect(x: badgeOrigin.x, y: badgeOrigin.y, width: badgeWidth, height: badgeHeight)

        // Rounded badge background (glassmorphic dark)
        let path = NSBezierPath(roundedRect: badgeRect, xRadius: 8, yRadius: 8)
        NSColor(red: 0.07, green: 0.09, blue: 0.15, alpha: 0.92).setFill()
        path.fill()

        // Border glow
        NSColor(red: 0.3, green: 0.5, blue: 0.9, alpha: 0.8).setStroke()
        path.lineWidth = 1.5
        path.stroke()

        // Step Pill inside badge
        let pillRect = CGRect(x: badgeOrigin.x + 8, y: badgeOrigin.y + badgeHeight - 24, width: 62, height: 16)
        let pillPath = NSBezierPath(roundedRect: pillRect, xRadius: 4, yRadius: 4)
        NSColor(red: 0.2, green: 0.45, blue: 0.95, alpha: 0.9).setFill()
        pillPath.fill()

        let pillAttrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.boldSystemFont(ofSize: 10),
            .foregroundColor: NSColor.white
        ]
        let pillString = "STEP #\(stepNumber)" as NSString
        pillString.draw(at: CGPoint(x: pillRect.origin.x + 6, y: pillRect.origin.y + 1), withAttributes: pillAttrs)

        // Timestamp
        let timeAttrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 10, weight: .regular),
            .foregroundColor: NSColor(white: 0.75, alpha: 1.0)
        ]
        let timeString = timestampText as NSString
        timeString.draw(at: CGPoint(x: badgeOrigin.x + 78, y: badgeOrigin.y + badgeHeight - 24), withAttributes: timeAttrs)

        // Status / Note Text
        let labelAttrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 11, weight: .semibold),
            .foregroundColor: NSColor(red: 0.9, green: 0.92, blue: 1.0, alpha: 1.0)
        ]
        let noteString = "\(labelText) (\(Int(pinX)), \(Int(pinY)))" as NSString
        noteString.draw(at: CGPoint(x: badgeOrigin.x + 8, y: badgeOrigin.y + 8), withAttributes: labelAttrs)

        context.restoreGState()
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var overlayView: GhostOverlayView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let screen = NSScreen.main else {
            fputs("Error: Could not find main screen\n", stderr)
            exit(1)
        }

        let frame = screen.frame
        window = NSWindow(
            contentRect: frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        // Overlay properties: click-through, floating, clear, spaces-wide
        window.level = .floating
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true // Pass clicks right through to underlying apps!
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]

        overlayView = GhostOverlayView(frame: frame)
        window.contentView = overlayView
        window.makeKeyAndOrderFront(nil)

        // Read commands from stdin asynchronously
        startCommandLoop()
    }

    func startCommandLoop() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let fileHandle = FileHandle.standardInput
            while true {
                let data = fileHandle.availableData
                if data.isEmpty {
                    break // EOF
                }
                guard let input = String(data: data, encoding: .utf8) else { continue }
                let lines = input.components(separatedBy: .newlines)
                for line in lines {
                    let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { continue }
                    self?.handleCommand(trimmed)
                }
            }
            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }
        }
    }

    func handleCommand(_ command: String) {
        let parts = command.split(separator: " ", maxSplits: 4).map(String.init)
        guard let action = parts.first else { return }

        switch action {
        case "show":
            // Format: show <x> <y> <step> <label>
            let x = parts.count > 1 ? (Double(parts[1]) ?? 0) : 0
            let y = parts.count > 2 ? (Double(parts[2]) ?? 0) : 0
            let step = parts.count > 3 ? (Int(parts[3]) ?? 1) : 1
            let label = parts.count > 4 ? parts[4] : "PINNED"

            let formatter = DateFormatter()
            formatter.dateFormat = "mm:ss.SSS"
            let timeStr = formatter.string(from: Date())

            DispatchQueue.main.async { [weak self] in
                self?.overlayView.setPin(x: CGFloat(x), y: CGFloat(y), step: step, label: label, timestamp: timeStr)
                print("ACK show \(x) \(y) \(step)")
                fflush(stdout)
            }

        case "hide":
            DispatchQueue.main.async { [weak self] in
                self?.overlayView.hidePin()
                print("ACK hide")
                fflush(stdout)
            }

        case "ping":
            print("PONG")
            fflush(stdout)

        case "quit":
            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }

        default:
            fputs("Unknown command: \(command)\n", stderr)
        }
    }
}

// Entrypoint
let app = NSApplication.shared
app.setActivationPolicy(.accessory) // Does not steal focus or show in dock
let delegate = AppDelegate()
app.delegate = delegate
app.run()
