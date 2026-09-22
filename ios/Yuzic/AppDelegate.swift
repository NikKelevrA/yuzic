public import Expo
internal import React
internal import ReactAppDependencyProvider
import CarPlay

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  /// The one React root for the process. See `reactRootViewController()`.
  private var reactRoot: UIViewController?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // A car can launch the app into its CarPlay scene alone, with no phone
    // window at all. React Native used to start only from the phone scene, so
    // in that launch no JavaScript ran: the engine was never set up, no
    // library was pushed, and the car showed an empty list that played
    // nothing. Starting it here, for the car, fixes both.
    NotificationCenter.default.addObserver(
      forName: UIScene.willConnectNotification, object: nil, queue: .main
    ) { [weak self] notification in
      guard notification.object is CPTemplateApplicationScene else { return }
      _ = self?.reactRootViewController()
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  /**
   The React root, created the first time any scene asks for it.

   One per process, whichever scene connects first. The CarPlay scene asks
   so JavaScript runs with no phone window; the phone scene asks and puts it
   in its window. Before this the phone scene started React Native itself on
   every connect, so a phone scene discarded and reconnected while CarPlay
   kept the process alive started a second React instance beside the first.

   The same three steps `RCTReactNativeFactory.startReactNative` takes, minus
   the window, which the caller supplies when it has one.
   */
  func reactRootViewController() -> UIViewController? {
    if let reactRoot { return reactRoot }
    guard let delegate = reactNativeDelegate, let factory = reactNativeFactory else { return nil }
    let rootView = factory.rootViewFactory.view(
      withModuleName: "main",
      initialProperties: nil,
      launchOptions: nil,
      devMenuConfiguration: factory.devMenuConfiguration
    )
    let controller = delegate.createRootViewController()
    delegate.setRootView(rootView, toRootViewController: controller)
    reactRoot = controller
    return controller
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
