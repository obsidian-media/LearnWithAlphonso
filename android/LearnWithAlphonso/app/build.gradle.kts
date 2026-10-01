plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

// Firebase (push) is wired only when the owner's google-services.json is
// present; CI writes it from the FIREBASE_GOOGLE_SERVICES_JSON secret. A build
// without it still compiles and the app simply never registers a token.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.obsidianmedia.learnwithalphonso"
    // Android now ships minor SDK releases; current AndroidX artifacts require 37.2 to compile.
    compileSdk = 37
    compileSdkMinor = 2

    defaultConfig {
        applicationId = "com.obsidianmedia.learnwithalphonso"
        minSdk = 26
        targetSdk = 36
        // Plan 5: the release workflow passes the run number so every upload is monotonically newer;
        // local and CI debug builds stay at 1.
        versionCode = (System.getenv("ANDROID_VERSION_CODE")?.toIntOrNull() ?: 1)
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Public client values (same as ios/.../AppConfig.swift). Not secrets.
        buildConfigField("String", "SUPABASE_URL", "\"https://qhcjpfbxfcltjbiuknyt.supabase.co\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_mIBGe0mIBTz---kX-vP59A_x0UhYbs9\"")
        buildConfigField("String", "API_BASE_URL", "\"https://learn.alphonsoecosystem.app\"")
        // Injected by CI from REVENUECAT_ANDROID_PUBLIC_KEY; empty means Pro is unavailable in this build (Plan 3).
        buildConfigField("String", "REVENUECAT_PUBLIC_KEY", "\"${System.getenv("REVENUECAT_ANDROID_PUBLIC_KEY") ?: ""}\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // Plan 5: the upload keystore is decoded by android-release.yml from the
    // ANDROID_UPLOAD_KEYSTORE_BASE64 secret into a temp file; a build without
    // it (every CI debug job, every local build) has no release signing config,
    // so a release task fails loudly instead of producing an unsigned bundle.
    val uploadKeystore = System.getenv("ANDROID_UPLOAD_KEYSTORE_PATH")?.let { file(it) }?.takeIf { it.exists() }
    if (uploadKeystore != null) {
        signingConfigs {
            create("upload") {
                storeFile = uploadKeystore
                storePassword = System.getenv("ANDROID_UPLOAD_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_UPLOAD_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_UPLOAD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            if (uploadKeystore != null) signingConfig = signingConfigs.getByName("upload")
            // Spec section 9: a release build must carry a real RevenueCat public key.
            val rcKey = System.getenv("REVENUECAT_ANDROID_PUBLIC_KEY") ?: ""
            if (gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) } && (rcKey.isBlank() || rcKey.startsWith("test_"))) {
                throw GradleException("Release builds need REVENUECAT_ANDROID_PUBLIC_KEY set to a production (non test_) key.")
            }
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }

    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.session)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)
    implementation(libs.firebase.messaging)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.revenuecat.purchases)
    // Lint: Activity Result APIs need Fragment >= 1.3.0; the transitive default is 1.1.0.
    implementation(libs.androidx.fragment)

    testImplementation(libs.junit4)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.ktor.client.mock)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
