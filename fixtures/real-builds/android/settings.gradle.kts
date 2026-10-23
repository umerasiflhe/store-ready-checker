// Minimal Android app built by .github/workflows/real-builds.yml (brief §7.6) to check the checker
// against a real Gradle/NDK artifact. Run with a pinned Gradle (no wrapper jar is committed).
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "RealBuild"
