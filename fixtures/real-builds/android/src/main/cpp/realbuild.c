#include <jni.h>

JNIEXPORT jstring JNICALL
Java_io_github_umerasiflhe_storeready_realbuild_MainActivity_message(JNIEnv *env, jclass clazz) {
  (void)clazz;
  return (*env)->NewStringUTF(env, "Store Ready real-build fixture");
}
