/* The MIT License (MIT)

Copyright (c) 2014-2015 Benoit Tremblay <trembl.ben@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE. */
(function() {
  'use strict';

  var Tech = videojs.getComponent('Tech');

  var Youtube = videojs.extends(Tech, {

    constructor: function(options, ready) {
      Tech.call(this, options, ready);
      this.setSrc(options.source);
    },

    createEl: function() {
      var div = document.createElement('div');
      div.setAttribute('id', this.options_.techId);
      div.setAttribute('style', 'width:100%;height:100%');

      var divWrapper = document.createElement('div');
      divWrapper.setAttribute('style', 'width:100%;height:100%;position:relative');
      divWrapper.appendChild(div);

      if (!_isOnMobile) {
        var divBlocker = document.createElement('div');
        divBlocker.setAttribute('class', 'vjs-iframe-blocker');
        divBlocker.setAttribute('style', 'position:absolute;top:0;left:0;width:100%;height:100%');

        // In case the blocker is still there and we want to pause
        divBlocker.onclick = function() {
          this.pause();
        }.bind(this);

        divWrapper.appendChild(divBlocker);
      }

      if (Youtube.isApiReady) {
        this.initYTPlayer();
      } else {
        Youtube.apiReadyQueue.push(this);
      }

      return divWrapper;
    },

    initYTPlayer: function() {
      this.ytPlayer = new YT.Player(this.options_.techId, {
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          loop: this.options_.loop ? 1 : 0
        },
        events: {
          onReady: this.onPlayerReady.bind(this),
          onPlaybackQualityChange: this.onPlayerPlaybackQualityChange.bind(this),
          onStateChange: this.onPlayerStateChange.bind(this),
          onError: this.onPlayerError.bind(this)
        }
      });
    },

    onPlayerReady: function() {
      this.triggerReady();

      if (this.playOnReady) {
        this.play();
      }
    },

    onPlayerPlaybackQualityChange: function() {

    },

    onPlayerStateChange: function(e) {
      var state = e.data;

      if (state === this.lastState) {
        return;
      }

      switch (state) {
        case -1:
          this.trigger('durationchange');
          break;

        case YT.PlayerState.ENDED:
          this.trigger('ended');
          break;

        case YT.PlayerState.PLAYING:
          this.trigger('timeupdate');
          this.trigger('durationchange');
          this.trigger('playing');
          this.trigger('play');

          if (this.isSeeking) {
            this.trigger('seeked');
            this.isSeeking = false;
          }
          break;

        case YT.PlayerState.PAUSED:
          if (this.isSeeking) {
            this.trigger('seeked');
            this.isSeeking = false;
            this.ytPlayer.playVideo();
          } else {
            this.trigger('pause');
          }
          break;

        case YT.PlayerState.BUFFERING:
          this.player_.trigger('timeupdate');
          this.player_.trigger('waiting');
          break;
      }

      this.lastState = state;
    },

    onPlayerError: function(e) {
      this.trigger(e);
    },

    src: function() {
      return this.source;
    },

    poster: function() {
      return this.poster;
    },

    setPoster: function(poster) {
      this.poster = poster;
    },

    setSrc: function(source) {
      if (!source || !source.src) {
        return;
      }

      this.source = source;
      this.url = Youtube.parseUrl(source.src);

      if (!this.options_.poster) {
        Youtube.loadThumbnailUrl(this.url.videoId, function(poster) {
          this.setPoster(poster);
          this.trigger('posterchange');
        }.bind(this));
      }

      if (this.options_.autoplay && !_isOnMobile) {
        if (this.isReady_) {
          this.play();
        } else {
          this.playOnReady = true;
        }
      }
    },

    play: function() {
      if (!this.url || !this.url.videoId) {
        return;
      }

      if (this.isReady_) {
        if (this.activeVideoId === this.url.videoId) {
          this.ytPlayer.playVideo();
        } else {
          this.ytPlayer.loadVideoById(this.url.videoId);
          this.activeVideoId = this.url.videoId;
        }
      } else {
        this.trigger('waiting');
        this.playOnReady = true;
      }
    },

    pause: function() {
      if (this.ytPlayer) {
        this.ytPlayer.pauseVideo();
      }
    },

    paused: function() {
      return (this.ytplayer) ?
        (this.lastState !== YT.PlayerState.PLAYING && this.lastState !== YT.PlayerState.BUFFERING)
        : true;
    },

    currentTime: function() {
      return this.ytPlayer ? this.ytPlayer.getCurrentTime() : 0;
    },

    setCurrentTime: function(seconds) {
      if (this.lastState === YT.PlayerState.PAUSED) {
        this.timeBeforeSeek = this.currentTime();
      }

      this.timeBeforeSeek = this.currentTime();

      this.ytPlayer.seekTo(seconds, true);
      this.trigger('timeupdate');
      this.trigger('seeking');
      this.isSeeking = true;

      // A seek event during pause does not return an event to trigger a seeked event,
      // so run an interval timer to look for the currentTime to change
      if (this.lastState === YT.PlayerState.PAUSED && this.timeBeforeSeek !== seconds) {
        this.checkSeekedInPauseInterval = setInterval(function() {
          if (this.lastState !== YT.PlayerState.PAUSED || !this.isSeeking) {
            // If something changed while we were waiting for the currentTime to change,
            //  clear the interval timer
            clearInterval(this.checkSeekedInPauseInterval);
          } else if (this.currentTime() !== this.timeBeforeSeek) {
            this.trigger('timeupdate');
            this.trigger('seeked');
            this.isSeeking = false;
            clearInterval(this.checkSeekedInPauseInterval);
          }

          this.play();
        }.bind(this), 250);
      }
    },

    playbackRate: function() {
      return this.ytPlayer ? this.ytPlayer.getPlaybackRate() : 1;
    },

    setPlaybackRate: function(suggestedRate) {
      if (!this.ytPlayer) {
        return;
      }

      this.ytPlayer.setPlaybackRate(suggestedRate);
      this.trigger('ratechange');
    },

    duration: function() {
      return this.ytPlayer ? this.ytPlayer.getDuration() : 0;
    },

    currentSrc: function() {
      return this.source;
    },

    ended: function() {
      return this.ytPlayer ? (this.lastState === YT.PlayerState.ENDED) : false;
    },

    volume: function() {
      return this.ytPlayer ? this.ytPlayer.getVolume() / 100.0 : 1;
    },

    setVolume: function(percentAsDecimal) {
      if (!this.ytPlayer) {
        return;
      }

      this.ytPlayer.setVolume(percentAsDecimal * 100.0);
    },

    muted: function() {
      return this.ytPlayer ? this.ytPlayer.isMuted() : false;
    },

    setMuted: function(mute) {
      if (!this.ytPlayer) {
        return;
      }

      if (mute) {
        this.ytPlayer.mute();
      } else {
        this.ytPlayer.unMute();
      }
    },

    buffered: function() {
      if(!this.ytPlayer || !this.ytPlayer.getVideoLoadedFraction) {
        return {
          length: 0,
          start: function() {
            throw new Error('This TimeRanges object is empty');
          },
          end: function() {
            throw new Error('This TimeRanges object is empty');
          }
        };
      }

      var end = this.ytPlayer.getVideoLoadedFraction() * this.ytPlayer.getDuration();

      return {
        length: 1,
        start: function() { return 0; },
        end: function() { return end; }
      };
    },

    supportsFullScreen: function() {
      if (typeof this.el_.webkitEnterFullScreen === 'function') {
        // Seems to be broken in Chromium/Chrome && Safari in Leopard
        if (/Android/.test(videojs.USER_AGENT) || !/Chrome|Mac OS X 10.5/.test(videojs.USER_AGENT)) {
          return true;
        }
      }

      return false;
    }

  });

  Youtube.isSupported = function() {
    return true;
  };

  Youtube.canPlaySource = function(e) {
    return (e.type === 'video/youtube');
  };

  var _isOnMobile = /(iPad|iPhone|iPod|Android)/g.test(navigator.userAgent);

  Youtube.parseUrl = function(url) {
    var result = {
      videoId: null
    };

    var regex = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match = url.match(regex);

    if (match && match[2].length === 11) {
      result.videoId = match[2];
    }

    return result;
  };

  // Tries to get the highest resolution thumbnail available for the video
  Youtube.loadThumbnailUrl = function(id, callback){

    var uri = 'https://img.youtube.com/vi/' + id + '/maxresdefault.jpg';
    var fallback = 'https://img.youtube.com/vi/' + id + '/0.jpg';

    try {
      var image = new Image();
      image.onload = function(){
        // Onload may still be called if YouTube returns the 120x90 error thumbnail
        if('naturalHeight' in this){
          if(this.naturalHeight <= 90 || this.naturalWidth <= 120) {
            this.onerror();
            return;
          }
        } else if(this.height <= 90 || this.width <= 120) {
          this.onerror();
          return;
        }

        callback(uri);
      };
      image.onerror = function(){
        callback(fallback);
      };
      image.src = uri;
    }
    catch(e){ callback(fallback); }
  };

  function loadApi() {
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }

  function injectCss() {
    var css = '.vjs-iframe-blocker { display: none; }' +
              '.vjs-user-inactive .vjs-iframe-blocker { display: block; }';

    var head = document.head || document.getElementsByTagName('head')[0];

    var style = document.createElement('style');
    style.type = 'text/css';

    if (style.styleSheet){
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }

    head.appendChild(style);
  }

  Youtube.apiReadyQueue = [];

  window.onYouTubeIframeAPIReady = function() {
    Youtube.isApiReady = true;

    for (var i = 0; i < Youtube.apiReadyQueue.length; ++i) {
      Youtube.apiReadyQueue[i].initYTPlayer();
    }
  };

  loadApi();
  injectCss();

  videojs.registerComponent('Youtube', Youtube);
})();
