cmake_minimum_required(VERSION 3.22)
project(realbuild C)

add_library(realbuild SHARED realbuild.c)

# NDK r28+ links 16 KB aligned by default. The 4 KB variant overrides that so the checker's
# AND-16K-001 finding can be proved against a real toolchain.
if(DEFINED REALBUILD_MAX_PAGE_SIZE)
  target_link_options(realbuild PRIVATE "-Wl,-z,max-page-size=${REALBUILD_MAX_PAGE_SIZE}")
endif()
