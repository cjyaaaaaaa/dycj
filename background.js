// 下载配置
const DOWNLOAD_CONFIG = {
  maxRetries: 5,
  initialRetryDelay: 2000,
  maxRetryDelay: 30000,
  retryableErrors: [
    "NETWORK_FAILED",
    "SERVER_FAILED",
    "SERVER_BAD_CONTENT",
    "NETWORK_DISCONNECTED",
    "NETWORK_TIMEOUT",
    "INTERRUPTED",
    "NETWORK_ERROR",
    "CONNECTION_RESET",
  ],
};

// 下载状态管理
const downloadStates = new Map();
let lastDownloadTime = 0;

// 格式化错误信息
function formatError(error) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    if (error.message) return error.message;
    if (error.current) return error.current;
    return JSON.stringify(error);
  }
  return "未知错误";
}

// 检查URL是否有效
async function isUrlValid(url) {
  try {
    // 检查URL格式
    if (!url || typeof url !== "string") {
      console.error("无效的URL格式:", url);
      return false;
    }

    // 检查URL是否包含必要的参数
    const urlObj = new URL(url);
    if (!urlObj.pathname || urlObj.pathname === "/") {
      console.error("URL缺少路径:", url);
      return false;
    }

    // 检查是否是抖音视频URL
    if (!url.includes("douyin.com") && !url.includes("aweme.snssdk.com")) {
      console.error("非抖音视频URL:", url);
      return false;
    }

    // 尝试使用HEAD请求检查URL
    try {
      const response = await fetch(url, {
        method: "HEAD",
        headers: {
          Referer: "https://www.douyin.com/",
          Accept: "*/*",
          "User-Agent": navigator.userAgent,
        },
        mode: "no-cors", // 允许跨域请求
        cache: "no-cache", // 禁用缓存
      });
      return true;
    } catch (fetchError) {
      // 如果HEAD请求失败，尝试使用GET请求
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Referer: "https://www.douyin.com/",
            Accept: "*/*",
            "User-Agent": navigator.userAgent,
          },
          mode: "no-cors",
          cache: "no-cache",
        });
        return true;
      } catch (getError) {
        console.warn("GET请求也失败，但继续尝试下载:", getError);
        // 即使请求失败也返回true，让下载过程继续
        return true;
      }
    }
  } catch (error) {
    console.warn("URL检查过程出错，但继续尝试下载:", error);
    // 发生错误时也返回true，让下载过程继续
    return true;
  }
}

// 创建安全的请求头
function createSafeHeaders(headers = []) {
  const safeNames = [
    "accept",
    "accept-language",
    "content-language",
    "content-type",
    "referer",
  ];

  // 确保包含必要的请求头
  const defaultHeaders = [
    { name: "Referer", value: "https://www.douyin.com/" },
    { name: "Accept", value: "*/*" },
  ];

  // 合并默认请求头和用户提供的请求头
  const allHeaders = [...defaultHeaders, ...headers];

  return allHeaders
    .filter((header) => {
      if (
        !header ||
        typeof header.name !== "string" ||
        typeof header.value !== "string"
      ) {
        return false;
      }
      const name = header.name.toLowerCase();
      return safeNames.includes(name);
    })
    .map((header) => ({
      name: header.name.toLowerCase(),
      value: header.value,
    }));
}

// 等待下载间隔
async function waitForDownloadInterval() {
  if (!DOWNLOAD_CONFIG.downloadInterval.enabled) return;

  const now = Date.now();
  const timeSinceLastDownload = now - lastDownloadTime;
  const minInterval = DOWNLOAD_CONFIG.downloadInterval.minInterval;
  const maxInterval = DOWNLOAD_CONFIG.downloadInterval.maxInterval;

  if (timeSinceLastDownload < minInterval) {
    const waitTime = Math.min(minInterval - timeSinceLastDownload, maxInterval);
    console.log(`等待下载间隔: ${waitTime}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastDownloadTime = Date.now();
}

// 处理Blob下载
async function handleBlobDownload(blobUrl, filename) {
  try {
    return new Promise((resolve, reject) => {
      chrome.downloads.download(
        {
          url: blobUrl,
          filename: filename,
          saveAs: false,
          conflictAction: "uniquify",
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            console.error("Blob下载初始化失败:", error);
            reject(new Error(error.message));
          } else {
            console.log("Blob下载已开始，ID:", downloadId);
            resolve(downloadId);
          }
        }
      );
    });
  } catch (error) {
    console.error("Blob下载过程发生错误:", error);
    throw new Error(`Blob下载失败: ${formatError(error)}`);
  }
}

// 检查网络状态
async function checkNetworkStatus() {
  try {
    const response = await fetch("https://www.baidu.com", {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-cache",
    });
    return true;
  } catch (error) {
    console.error("网络状态检查失败:", error);
    return false;
  }
}

// 等待网络恢复
async function waitForNetworkRecovery(maxChecks = 3) {
  for (let i = 0; i < maxChecks; i++) {
    if (await checkNetworkStatus()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return false;
}

// 处理下载错误
async function handleDownloadError(
  downloadId,
  error,
  downloadOptions,
  retryCount = 0
) {
  const errorMessage = formatError(error);
  console.error(`下载失败 (ID: ${downloadId}):`, errorMessage);

  // 检查是否是可重试的错误
  const isRetryable =
    DOWNLOAD_CONFIG.retryableErrors.includes(errorMessage) ||
    errorMessage.includes("INTERRUPTED") ||
    errorMessage.includes("NETWORK");

  if (isRetryable && retryCount < DOWNLOAD_CONFIG.maxRetries) {
    const nextRetryCount = retryCount + 1;

    // 如果是网络相关错误，先检查网络状态
    if (
      errorMessage.includes("NETWORK") ||
      errorMessage.includes("INTERRUPTED")
    ) {
      console.log("检测到网络问题，等待网络恢复...");
      const networkRecovered = await waitForNetworkRecovery(
        DOWNLOAD_CONFIG.networkCheck.maxChecks
      );
      if (!networkRecovered) {
        console.error("网络未恢复，取消重试");
        throw new Error("网络连接不可用，请检查网络后重试");
      }
    }

    // 使用指数退避策略计算重试延迟
    const retryDelay = Math.min(
      DOWNLOAD_CONFIG.initialRetryDelay * Math.pow(2, nextRetryCount - 1),
      DOWNLOAD_CONFIG.maxRetryDelay
    );

    console.log(`准备第 ${nextRetryCount} 次重试下载, 延迟: ${retryDelay}ms`);

    try {
      // 等待重试延迟
      await new Promise((resolve) => setTimeout(resolve, retryDelay));

      // 重新过滤请求头并开始新的下载
      const newDownloadId = await handleBlobDownload(
        downloadOptions.url,
        downloadOptions.filename
      );

      // 更新下载状态
      downloadStates.set(newDownloadId, {
        retryCount: nextRetryCount,
        downloadOptions,
        lastError: errorMessage,
        lastRetryTime: Date.now(),
      });

      return newDownloadId;
    } catch (retryError) {
      return handleDownloadError(
        downloadId,
        retryError,
        downloadOptions,
        nextRetryCount
      );
    }
  }

  throw new Error(
    `下载失败，已达到最大重试次数或不可重试的错误: ${errorMessage}`
  );
}

// 通知下载状态
function notifyDownloadStatus(status, data) {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            action: `download${status}`,
            ...data,
          })
          .catch((error) => {
            console.warn("发送消息失败:", error);
          });
      }
    });
  } catch (error) {
    console.warn("通知下载状态失败:", error);
  }
}

// 处理下载请求
async function handleDownloadRequest(request, sendResponse) {
  try {
    // 等待下载间隔
    await waitForDownloadInterval();

    const downloadOptions = {
      url: request.url,
      filename: request.filename,
    };

    if (!downloadOptions.url) {
      throw new Error("下载URL不能为空");
    }
    if (!downloadOptions.filename) {
      throw new Error("文件名不能为空");
    }

    // 开始下载
    const downloadId = await handleBlobDownload(
      downloadOptions.url,
      downloadOptions.filename
    );

    // 保存下载状态
    downloadStates.set(downloadId, {
      retryCount: 0,
      downloadOptions,
      startTime: Date.now(),
      url: request.url,
    });

    // 通知下载开始
    notifyDownloadStatus("Started", { downloadId });
    sendResponse({ success: true, downloadId });
  } catch (error) {
    const errorMessage = formatError(error);
    console.error("处理下载请求时发生错误:", errorMessage);

    if (errorMessage.includes("URL") || errorMessage.includes("链接")) {
      notifyDownloadStatus("Failed", {
        error: "视频链接可能已过期，请刷新页面后重试",
        needRefresh: true,
      });
      sendResponse({
        success: false,
        error: "视频链接可能已过期，请刷新页面后重试",
        needRefresh: true,
      });
    } else {
      notifyDownloadStatus("Failed", { error: errorMessage });
      sendResponse({ success: false, error: errorMessage });
    }
  }
  return true;
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "download") {
    handleDownloadRequest(request, sendResponse);
    return true;
  } else if (request.action === "downloadBlob") {
    handleBlobDownload(request.blobUrl, request.filename)
      .then((downloadId) => {
        // 保存下载状态
        downloadStates.set(downloadId, {
          startTime: Date.now(),
          filename: request.filename,
        });

        // 通知下载开始
        notifyDownloadStatus("Started", { downloadId });

        sendResponse({ success: true, downloadId });
      })
      .catch((error) => {
        notifyDownloadStatus("Failed", { error: error.message });
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开放
  }
});

// 监听下载状态变化
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state) {
    const downloadId = delta.id;
    const state = downloadStates.get(downloadId);

    if (state) {
      if (delta.state.current === "complete") {
        console.log("下载完成:", downloadId);
        notifyDownloadStatus("Complete", { downloadId });
        downloadStates.delete(downloadId);
      } else if (delta.state.current === "interrupted") {
        console.log("下载被中断:", downloadId);
        const error = delta.error
          ? chrome.runtime.lastError?.message || "未知错误"
          : "INTERRUPTED";
        notifyDownloadStatus("Failed", { error });
        downloadStates.delete(downloadId);
      }
    }
  }
});

// 监听扩展安装或更新
chrome.runtime.onInstalled.addListener(() => {
  console.log("扩展已安装/更新");
  downloadStates.clear();
});
