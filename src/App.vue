<script>
export default {
  name: "DouyinDownloader",
  data() {
    return {
      loading: false,
      error: "",
      status: "",
      videoInfo: null,
      retryCount: 0,
      maxRetries: 3,
      isOnDouyin: false,
      videoCheckInterval: null,
      isVideoPage: false,
    };
  },
  computed: {
    buttonText() {
      if (this.loading) return "下载中...";
      if (!this.isDouyinPage) return "请在抖音视频页面使用";
      if (!document.querySelector("video")) return "等待视频加载...";
      return "下载视频";
    },
    isDouyinPage() {
      const url = window.location.href;
      // 检查是否是抖音域名
      if (!url.includes("www.douyin.com")) {
        return false;
      }

      // 检查是否是视频页面
      const isVideoPage =
        url.includes("/video/") ||
        url.includes("aweme_id=") ||
        document.querySelector("video") !== null;

      return isVideoPage;
    },
    isError() {
      return this.status.includes("失败") || this.status.includes("错误");
    },
  },
  methods: {
    async checkDouyinPage() {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        this.isOnDouyin = tab.url.includes("douyin.com");
        if (this.isOnDouyin) {
          this.getVideoInfo();
        }
      } catch (error) {
        console.error("检查页面失败:", error);
      }
    },
    async getVideoInfo() {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "getVideoInfo",
        });
        if (response && response.success) {
          this.videoInfo = response.data;
        }
      } catch (error) {
        console.error("获取视频信息失败:", error);
      }
    },
    async handleDownload() {
      if (this.loading) return;

      this.loading = true;
      this.error = "";
      this.status = "正在准备下载...";

      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        // 检查是否有视频元素
        const hasVideo = document.querySelector("video") !== null;
        if (!hasVideo) {
          throw new Error("请等待视频加载完成");
        }

        // 尝试获取视频信息
        await this.getVideoInfo();

        // 发送下载请求
        this.status = "正在获取视频地址...";
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "downloadVideo",
        });

        if (response && response.success) {
          this.status = "视频下载已开始，请稍候...";
          // 监听下载完成事件
          chrome.downloads.onChanged.addListener(this.handleDownloadComplete);
        } else {
          throw new Error("获取视频地址失败");
        }
      } catch (error) {
        console.error("下载失败:", error);
        this.error = this.getErrorMessage(error);
        this.status = `错误: ${error.message}`;

        // 重试逻辑
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          this.status = `正在重试 (${this.retryCount}/${this.maxRetries})...`;
          setTimeout(() => this.handleDownload(), 1000 * this.retryCount); // 递增重试延迟
        }
      } finally {
        this.loading = false;
      }
    },
    getErrorMessage(error) {
      if (error.message.includes("视频加载")) {
        return "视频加载失败，请刷新页面后重试";
      } else if (error.message.includes("视频地址")) {
        return "无法获取视频地址，请确保视频已完全加载";
      } else if (error.message.includes("网络")) {
        return "网络连接失败，请检查网络后重试";
      } else {
        return "下载失败，请重试";
      }
    },
    handleDownloadComplete(downloadDelta) {
      if (downloadDelta.state && downloadDelta.state.current === "complete") {
        this.status = "下载完成！";
        this.retryCount = 0;
        chrome.downloads.onChanged.removeListener(this.handleDownloadComplete);
      } else if (downloadDelta.error) {
        const errorMessage = this.getDownloadErrorMessage(
          downloadDelta.error.current
        );
        this.status = `下载失败: ${errorMessage}`;
        this.error = "下载出错，请重试";
        chrome.downloads.onChanged.removeListener(this.handleDownloadComplete);
      }
    },
    getDownloadErrorMessage(error) {
      switch (error) {
        case "NETWORK_FAILED":
          return "网络连接失败";
        case "SERVER_FAILED":
          return "服务器响应失败";
        case "SERVER_BAD_CONTENT":
          return "服务器返回错误内容";
        case "USER_CANCELED":
          return "用户取消下载";
        default:
          return "未知错误";
      }
    },
    async checkVideoPage() {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab.url.includes("douyin.com")) {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: "getVideoInfo",
          });
          if (response && response.success && response.data) {
            this.isVideoPage = true;
            this.videoInfo = response.data;
          }
        }
      } catch (error) {
        console.error("Error checking video page:", error);
      }
    },
    async downloadVideo() {
      try {
        this.loading = true;
        this.error = "";
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        await chrome.tabs.sendMessage(tab.id, { action: "downloadVideo" });
      } catch (error) {
        this.error = "下载失败，请重试";
        console.error("Error downloading video:", error);
      } finally {
        this.loading = false;
      }
    },
    formatDuration(seconds) {
      if (!seconds) return "未知";
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    },
  },
  mounted() {
    if (this.isDouyinPage) {
      // 定期检查视频元素
      this.videoCheckInterval = setInterval(() => {
        const hasVideo = document.querySelector("video") !== null;
        if (hasVideo) {
          this.getVideoInfo();
        }
      }, 1000);
    }
    this.checkVideoPage();
  },
  beforeUnmount() {
    if (this.videoCheckInterval) {
      clearInterval(this.videoCheckInterval);
    }
  },
};
</script>

<template>
  <div class="container">
    <div v-if="isVideoPage" class="video-info">
      <h2 class="title">{{ videoInfo.title }}</h2>
      <div class="duration">时长: {{ formatDuration(videoInfo.duration) }}</div>
      <button class="download-btn" @click="downloadVideo" :disabled="loading">
        {{ loading ? "下载中..." : "下载视频" }}
      </button>
      <div v-if="error" class="error">{{ error }}</div>
    </div>
    <div v-else class="not-video">请在抖音视频页面使用此插件</div>
  </div>
</template>

<style scoped>
.container {
  width: 300px;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}

.video-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  line-height: 1.4;
}

.duration {
  font-size: 14px;
  color: #666;
}

.download-btn {
  background-color: #fe2c55;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.download-btn:hover {
  background-color: #f01c45;
}

.download-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.error {
  color: #ff4d4f;
  font-size: 14px;
  margin-top: 8px;
}

.not-video {
  text-align: center;
  color: #666;
  font-size: 14px;
  padding: 20px 0;
}
</style>
