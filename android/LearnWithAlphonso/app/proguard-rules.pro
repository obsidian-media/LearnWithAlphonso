# kotlinx.serialization: keep generated serializers for our models.
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class com.obsidianmedia.learnwithalphonso.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.obsidianmedia.learnwithalphonso.**$$serializer { *; }
-keepclassmembers class com.obsidianmedia.learnwithalphonso.** { *** Companion; }
