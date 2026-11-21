import UIKit
import Capacitor

final class LifeViewController: CAPBridgeViewController {
    private let boundDoubleTaps = NSHashTable<UITapGestureRecognizer>.weakObjects()
    private lazy var doubleTapBlocker: UITapGestureRecognizer = {
        let tap = UITapGestureRecognizer(target: self, action: #selector(ignoreDoubleTap(_:)))
        tap.numberOfTapsRequired = 2
        tap.numberOfTouchesRequired = 1
        tap.cancelsTouchesInView = false
        tap.delaysTouchesBegan = false
        tap.delaysTouchesEnded = false
        return tap
    }()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }

        // A full-screen WKWebView can pan its entire viewport when focusing an
        // input. Keep its physical bounds outside the status bar and home area.
        let container = UIView(frame: webView.frame)
        container.backgroundColor = UIColor(red: 246.0 / 255.0, green: 246.0 / 255.0, blue: 240.0 / 255.0, alpha: 1)
        view = container
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.clipsToBounds = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        container.addSubview(webView)

        let safeArea = container.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: safeArea.topAnchor),
            webView.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safeArea.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor)
        ])
        webView.addGestureRecognizer(doubleTapBlocker)
        disableDoubleTapZoom(in: webView)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if let webView = webView {
            disableDoubleTapZoom(in: webView)
        }
    }

    private func disableDoubleTapZoom(in view: UIView) {
        // WebKit can re-enable its smart-zoom recognizers after a single tap.
        // A failure dependency survives those toggles without private API calls.
        for recognizer in view.gestureRecognizers ?? [] {
            if let tap = recognizer as? UITapGestureRecognizer,
               tap !== doubleTapBlocker,
               tap.numberOfTapsRequired == 2,
               tap.numberOfTouchesRequired == 1,
               !boundDoubleTaps.contains(tap) {
                tap.require(toFail: doubleTapBlocker)
                boundDoubleTaps.add(tap)
            }
        }
        for subview in view.subviews {
            disableDoubleTapZoom(in: subview)
        }
    }

    @objc private func ignoreDoubleTap(_ recognizer: UITapGestureRecognizer) {
        // Consume only the double-tap gesture; it has no application action.
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
