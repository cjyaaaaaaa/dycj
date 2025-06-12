// 视频信息获取配置
const VIDEO_CONFIG = {
  titleSelectors: [
    ".video-title",
    ".title",
    ".desc",
    ".desc-text",
    ".video-info-title",
    ".video-info-desc",
    ".video-info-content",
    '[data-e2e="video-title"]',
    '[data-e2e="video-desc"]',
  ],
  videoUrlPatterns: [
    { pattern: /"playAddr":"([^"]+)"/, key: "playAddr" },
    { pattern: /"playApi":"([^"]+)"/, key: "playApi" },
    { pattern: /"videoUrl":"([^"]+)"/, key: "videoUrl" },
  ],
  // 只保留Chrome扩展允许的安全请求头
  headers: [
    {
      name: "accept",
      value: "*/*",
    },
    {
      name: "accept-language",
      value: "zh-CN,zh;q=0.9",
    },
    {
      name: "content-type",
      value: "application/json",
    },
  ],
};

// 格式化时长
function formatDuration(seconds) {
  if (!seconds) return "未知";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

// 获取视频标题
function getVideoTitle() {
  for (const selector of VIDEO_CONFIG.titleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const title = element.textContent.trim();
      if (title) return title;
    }
  }
  return "未知标题";
}

// 等待视频元素加载
function waitForVideoElement(timeout = 10000) {
  return new Promise((resolve) => {
    const video = document.querySelector("video");
    if (video) {
      resolve(video);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const video = document.querySelector("video");
      if (video) {
        obs.disconnect();
        resolve(video);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// 从脚本中提取视频URL
function extractVideoUrlFromScripts() {
  const scripts = document.querySelectorAll("script");
  for (const script of scripts) {
    const content = script.textContent;
    for (const { pattern } of VIDEO_CONFIG.videoUrlPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].replace(/\\u002F/g, "/");
      }
    }
  }
  return null;
}

// 从视频元素中获取URL
function getVideoUrlFromElement(videoElement) {
  if (videoElement.src) return videoElement.src;
  if (videoElement.currentSrc) return videoElement.currentSrc;

  const source = videoElement.querySelector("source");
  if (source && source.src) return source.src;

  if (videoElement.dataset.src) return videoElement.dataset.src;

  return null;
}

// 从网络请求中获取URL
function getVideoUrlFromNetwork() {
  // 从资源中查找
  const resources = performance.getEntriesByType("resource");
  for (const resource of resources) {
    if (
      resource.name.includes(".mp4") ||
      resource.name.includes("video") ||
      resource.name.includes("playAddr") ||
      resource.name.includes("aweme")
    ) {
      return resource.name;
    }
  }

  // 从XHR请求中查找
  const xhrResources = resources.filter(
    (r) => r.initiatorType === "xmlhttprequest"
  );
  for (const resource of xhrResources) {
    if (
      resource.name.includes("video") ||
      resource.name.includes("playAddr") ||
      resource.name.includes("aweme")
    ) {
      return resource.name;
    }
  }

  return null;
}

// 获取视频信息
async function getVideoInfo() {
  try {
    const videoElement = await waitForVideoElement();
    if (!videoElement) {
      throw new Error("未找到视频元素");
    }

    const title = getVideoTitle();
    return {
      title: title || "未知标题",
      duration: formatDuration(videoElement.duration || 0),
    };
  } catch (error) {
    console.error("获取视频信息失败:", error);
    throw error; // 向上传递错误
  }
}

// 下载视频
async function downloadVideo() {
  try {
    const videoElement = await waitForVideoElement();
    if (!videoElement) {
      throw new Error("未找到视频元素");
    }

    let videoUrl = extractVideoUrlFromScripts();
    if (!videoUrl) videoUrl = getVideoUrlFromElement(videoElement);
    if (!videoUrl) videoUrl = getVideoUrlFromNetwork();

    if (!videoUrl) {
      const pathId = window.location.pathname.split("/").pop();
      if (pathId) {
        videoUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${pathId}`;
      }
    }

    if (!videoUrl) {
      throw new Error("未找到视频URL");
    }

    // 处理URL
    if (videoUrl.startsWith("//")) {
      videoUrl = "https:" + videoUrl;
    }
    if (videoUrl.startsWith("http://")) {
      videoUrl = videoUrl.replace("http://", "https://");
    }

    const title = getVideoTitle();
    const filename = `${title || "抖音视频"}_${Date.now()}.mp4`;

    // 使用fetch下载视频
    try {
      console.log("开始下载视频:", videoUrl);
      const response = await fetch(videoUrl, {
        headers: {
          Accept: "*/*",
        },
        credentials: "include", // 包含cookies
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // 发送blob URL到background script进行下载
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "downloadBlob",
            blobUrl: blobUrl,
            filename: filename,
          },
          (response) => {
            // 清理blob URL
            URL.revokeObjectURL(blobUrl);

            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response && response.error) {
              reject(new Error(response.error));
            } else {
              resolve(true);
            }
          }
        );
      });
    } catch (fetchError) {
      console.error("视频下载失败:", fetchError);
      throw new Error("视频下载失败，请重试");
    }
  } catch (error) {
    console.error("下载视频时发生错误:", error);
    throw error;
  }
}

// 修改视频元素监听器
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      const video = document.querySelector("video");
      if (video && !video.hasAttribute("data-processed")) {
        video.setAttribute("data-processed", "true");

        // 视频元数据加载
        video.addEventListener("loadedmetadata", () => {
          console.log("视频元数据已加载");
        });

        // 视频错误处理
        video.addEventListener("error", (event) => {
          const error = event.target.error;
          let errorInfo = "未知错误";

          if (error) {
            errorInfo = {
              code: error.code,
              message: error.message || getMediaErrorMessage(error.code),
            };
          }

          console.error("视频加载错误:", errorInfo);

          if (error && error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
            console.log("尝试重新加载视频...");
            const currentSrc = video.currentSrc;
            video.load();
            if (currentSrc) {
              video.src = currentSrc;
            }
          }
        });

        // 获取媒体错误信息
        function getMediaErrorMessage(code) {
          switch (code) {
            case MediaError.MEDIA_ERR_ABORTED:
              return "视频加载被中止";
            case MediaError.MEDIA_ERR_NETWORK:
              return "网络错误";
            case MediaError.MEDIA_ERR_DECODE:
              return "视频解码错误";
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              return "不支持的视频格式";
            default:
              return "未知错误";
          }
        }

        // 视频加载停滞处理
        video.addEventListener("stalled", () => {
          console.log("视频加载停滞，尝试恢复...");
          video.load();
        });

        // 视频播放开始
        video.addEventListener("play", () => {
          console.log("视频开始播放");
        });

        // 视频加载进度
        video.addEventListener("progress", () => {
          const progress =
            video.buffered.length > 0
              ? (
                  (video.buffered.end(video.buffered.length - 1) /
                    video.duration) *
                  100
                ).toFixed(2) + "%"
              : "0%";
          console.log("视频加载进度:", progress);

          if (progress === "0%" && video.readyState < 3) {
            console.log("检测到加载停滞，尝试恢复...");
            video.load();
          }
        });

        // 视频加载完成
        video.addEventListener("loadeddata", () => {
          console.log("视频数据已加载");
        });

        // 视频加载中断
        video.addEventListener("suspend", () => {
          console.log("视频加载被暂停");
        });

        // 视频加载恢复
        video.addEventListener("resume", () => {
          console.log("视频加载已恢复");
        });

        // 视频加载等待
        video.addEventListener("waiting", () => {
          console.log("视频加载等待中...");
        });

        // 视频加载超时
        video.addEventListener("timeout", () => {
          console.log("视频加载超时，尝试恢复...");
          video.load();
        });
      }
    }
  }
});

// 开始观察
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// 监听来自background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === "downloadVideo") {
      downloadVideo()
        .then((success) => {
          sendResponse({ success });
        })
        .catch((error) => {
          console.error("下载视频时发生错误:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道开放
    } else if (request.action === "getVideoInfo") {
      getVideoInfo()
        .then((info) => {
          sendResponse({ success: true, data: info });
        })
        .catch((error) => {
          console.error("获取视频信息时发生错误:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 保持消息通道开放
    } else if (request.action.startsWith("download")) {
      // 处理下载状态通知
      console.log("收到下载状态通知:", request);
      sendResponse({ success: true });
      return true;
    }
  } catch (error) {
    console.error("处理消息时发生错误:", error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
});

// 添加错误处理函数
function handleError(error, context) {
  console.error(`${context} 发生错误:`, error);
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
