plugins {
  id("com.android.application") version "9.4.1"
}

// Variants are chosen with Gradle properties instead of separate projects:
//   -PtargetSdk=34          → expect AND-TSDK-001
//   -PmaxPageSize=4096      → link the JNI library 4 KB aligned, expect AND-16K-001
val realBuildTargetSdk = (findProperty("targetSdk") as String?)?.toInt() ?: 36
val realBuildMaxPageSize = findProperty("maxPageSize") as String?

android {
  namespace = "io.github.umerasiflhe.storeready.realbuild"
  compileSdk = 36
  ndkVersion = "28.2.13676358"

  defaultConfig {
    applicationId = "io.github.umerasiflhe.storeready.realbuild"
    minSdk = 24
    targetSdk = realBuildTargetSdk
    versionCode = 1
    versionName = "1.0"
    ndk {
      abiFilters += listOf("arm64-v8a", "x86_64")
    }
    externalNativeBuild {
      cmake {
        if (realBuildMaxPageSize != null) {
          arguments += "-DREALBUILD_MAX_PAGE_SIZE=$realBuildMaxPageSize"
        }
      }
    }
  }

  externalNativeBuild {
    cmake {
      path = file("src/main/cpp/CMakeLists.txt")
      version = "3.31.6"
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}
