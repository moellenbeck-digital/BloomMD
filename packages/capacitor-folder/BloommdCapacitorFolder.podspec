require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'BloommdCapacitorFolder'
  s.version = package['version']
  s.summary = package['description']
  s.license = { :type => 'Elastic-2.0', :file => 'LICENSE' }
  s.homepage = package['repository']['url']
  s.author = package['author']
  s.source = { :git => package['repository']['url'], :tag => "v#{s.version}" }
  s.source_files = 'ios/Sources/**/*.swift'
  # Required-reason API declarations (file timestamps, UserDefaults) for App Store review.
  s.resource_bundles = { 'BloommdCapacitorFolder_Privacy' => ['ios/Sources/BloomFolderPlugin/PrivacyInfo.xcprivacy'] }
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
