import SwiftUI
import UIKit

// A UIKit entry point hosting a SwiftUI view, rather than a SwiftUI `App`, so the same sources
// also build for the deployment-target-12.0 variant (`App` needs iOS 14, SwiftUI iOS 13).
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let window = UIWindow(frame: UIScreen.main.bounds)
    if #available(iOS 13.0, *) {
      window.rootViewController = UIHostingController(rootView: ContentView())
    } else {
      let controller = UIViewController()
      let label = UILabel()
      label.text = "Store Ready real-build fixture"
      controller.view = label
      window.rootViewController = controller
    }
    window.makeKeyAndVisible()
    self.window = window
    return true
  }
}

@available(iOS 13.0, *)
struct ContentView: View {
  var body: some View {
    Text("Store Ready real-build fixture")
  }
}
