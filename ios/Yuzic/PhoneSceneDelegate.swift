import UIKit

class PhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let root = appDelegate.reactRootViewController() else { return }

    // The root may already be running: started for CarPlay, or by an earlier
    // phone scene the system discarded. Either way it is the same one.
    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = root
    self.window = window
    window.makeKeyAndVisible()
  }
}
