// libAntiMicu.cpp - native gate manh (optional, can NDK de build).
// Build: ndk-build hoac cmake. Target arm64-v8a + armeabi-v7a.
// Ten lib: libAntiMicu.so -> chep vao lib/arm64-v8a/ + lib/armeabi-v7a/
// Goi tu Java: AntiMicu.nativeGate() == 0 moi cho chay tiep.

#include <jni.h>
#include <string.h>
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <pthread.h>
#include <sys/ptrace.h>
#include <sys/inotify.h>
#include <dlfcn.h>

static int has_tracer(){
  char buf[512]; int fd=open("/proc/self/status",O_RDONLY);
  if(fd<0) return 0;
  ssize_t n=read(fd,buf,sizeof(buf)-1); close(fd);
  if(n<=0) return 0; buf[n]=0;
  char*p=strstr(buf,"TracerPid:");
  if(!p) return 0;
  return atoi(p+10)!=0;
}
static int has_frida_maps(){
  char line[1024]; FILE*f=fopen("/proc/self/maps","r");
  if(!f) return 0;
  while(fgets(line,sizeof(line),f)){
    if(strstr(line,"frida")||strstr(line,"gum-js")||strstr(line,"linjector")
       ||strstr(line,"XposedBridge")||strstr(line,"substrate")){
      fclose(f); return 1;
    }
  }
  fclose(f); return 0;
}
static int has_su(){
  const char*ps[]={"/system/bin/su","/system/xbin/su","/sbin/su","/sbin/.magisk","/data/adb/magisk",0};
  for(int i=0;ps[i];i++) if(access(ps[i],F_OK)==0) return 1;
  return 0;
}
// tu protect: neu bi ptrace thi thoat ngay
static void* watcher(void*){
  // chan ptrace don gian: giu PTRACE_TRACEME, ai trace nua se fail
  ptrace(PTRACE_TRACEME,0,0,0);
  while(1){
    sleep(3);
    if(has_tracer()||has_frida_maps()){
      // khong crash ngay de tranh bi bat pattern, chi lam hong session key trong RAM
      // o day demo: _exit(0). Ban that co the thay bang return ve Java de finish() nhe nhang.
      _exit(0);
    }
  }
  return 0;
}
extern "C" JNIEXPORT jint JNICALL Java_vn_micu_gate_AntiMicu_nativeGate(JNIEnv*,jclass){
  // goi 1 lan duy nhat tu Application.onCreate
  static int started=0;
  if(!started){
    started=1;
    // neu dang bi debug ngay tu dau -> tra loi
    if(has_tracer()) return 1;
    if(has_frida_maps()) return 2;
    pthread_t t; pthread_create(&t,0,watcher,0); pthread_detach(t);
  }
  if(has_su()){
    // chi canh bao, khong block (vi da so may root moi choi multi)
  }
  return 0;
}
