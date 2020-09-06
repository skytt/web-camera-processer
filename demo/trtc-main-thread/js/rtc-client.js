class RtcClient {
  constructor(options) {
    this.sdkAppId_ = options.sdkAppId;
    this.userId_ = options.userId;
    this.userSig_ = options.userSig;
    this.roomId_ = options.roomId;

    this.isJoined_ = false;
    this.isPublished_ = false;
    this.isAudioMuted = false;
    this.isVideoMuted = false;
    this.localStream_ = null;
    this.remoteStreams_ = [];
    this.members_ = new Map();

    // create a client for RtcClient
    this.client_ = TRTC.createClient({
      mode: 'rtc',
      sdkAppId: this.sdkAppId_,
      userId: this.userId_,
      userSig: this.userSig_
    });
    this.handleEvents();
  }

  async join() {
    if (this.isJoined_) {
      console.warn('duplicate RtcClient.join() observed');
      return;
    }
    try {
      // join the room
      await this.client_.join({
        roomId: this.roomId_
      });
      console.log('join room success');
      this.isJoined_ = true;

      const canvasElt = document.getElementById('main-canvas');
      const canvasEltx1 = canvasElt.getContext('2d');
      const testVideo = document.getElementById('test');

      const maskimg = document.getElementById('maskimg');

      var i
      var net = await bodyPix.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2
      });

      testVideo.addEventListener('play', async function () {
        i = window.setInterval(async function () {
          // console.log(videomode)
          switch (videomode) {
            // 正常模式开始
            // i = window.setInterval(async function () {
            case 0:
              canvasEltx1.drawImage(testVideo, 0, 0, testVideo.videoWidth, testVideo.videoHeight, 0, 0, 640, 360)
              break
            // }, 60);
            // 正常模式结束


            // 背景虚化开始
            // i = window.setInterval(async function () {
            case 1:
              const segmentation1 = await net.segmentMultiPerson(testVideo, {
                internalResolution: 'medium',
                segmentationThreshold: 0.7,
                maxDetections: 3,
                scoreThreshold: 0.3,
                nmsRadius: 20,
              });
              const backgroundBlurAmount = 8;
              const edgeBlurAmount = 2;
              const flipHorizontal = false;

              // Draw the image with the background blurred onto the canvas. The edge between
              // the person and blurred background is blurred by 3 pixels.
              bodyPix.drawBokehEffect(canvasElt, testVideo, segmentation1, backgroundBlurAmount, edgeBlurAmount, flipHorizontal);
              break
            // }, 60)
            // 背景虚化结束


            // 叠加图片开始
            // i = window.setInterval(async function () {
            case 2:
              const segmentation2 = await net.segmentMultiPerson(testVideo, {
                internalResolution: 'medium',
                segmentationThreshold: 0.7,
                maxDetections: 3,
                scoreThreshold: 0.3,
                nmsRadius: 20,
              });

              const foregroundColor = { r: 0, g: 0, b: 0, a: 0 };
              const backgroundColor = { r: 0, g: 0, b: 0, a: 255 };
              let backgroundDarkeningMask = bodyPix.toMask(
                segmentation2, foregroundColor, backgroundColor
              );

              // const opacity = 1;
              // const maskBlurAmount = 2;
              // const flipHorizontal = false;
              // bodyPix.drawMask(canvasElt, testVideo, backgroundDarkeningMask, opacity, maskBlurAmount, flipHorizontal);

              if (backgroundDarkeningMask !== null) {
                canvasEltx1.putImageData(backgroundDarkeningMask, 0, 0);
                canvasEltx1.globalCompositeOperation = 'source-in';
                // canvasEltx1.putImageData(maskimgData, 0, 0);
                canvasEltx1.drawImage(maskimg, 0, 0);
                canvasEltx1.globalCompositeOperation = 'destination-over'
                canvasEltx1.drawImage(testVideo, 0, 0, testVideo.videoWidth, testVideo.videoHeight, 0, 0, 640, 360)
                canvasEltx1.globalCompositeOperation = 'source-over';
              } else {
                // canvasEltx1.putImageData(maskimgData, 0, 0);
                canvasEltx1.drawImage(maskimg, 0, 0);
              }
              break
            // }, 60)
            // 叠加图片结束
          }
        }, 60);

      }, false);
      testVideo.addEventListener('pause', function () { window.clearInterval(i); }, false);
      testVideo.addEventListener('ended', function () { clearInterval(i); }, false);

      // Get the stream
      let canvasStream = canvasElt.captureStream(15); // 15 FPS
      let canvasVideoTrack = canvasStream.getVideoTracks()[0];

      let audioTrack
      await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 360, frameRate: 15 }
      }).then(stream => {
        audioTrack = stream.getAudioTracks()[0];
        testVideo.srcObject = stream;
        testVideo.play();
      });

      this.localStream_ = TRTC.createStream({
        audioSource: audioTrack,
        videoSource: canvasVideoTrack,
        userId: this.userId_,
        mirror: true
      });
      this.localStream_.setVideoProfile({ width: 640, height: 360, frameRate: 15, bitrate: 800 /* kpbs */ });

      try {
        // initialize the local stream and the stream will be populated with audio/video
        await this.localStream_.initialize();
        console.log('initialize local stream success');

        this.localStream_.on('player-state-changed', event => {
          console.log(`local stream ${event.type} player is ${event.state}`);
        });

        // publish the local stream
        await this.publish();

        // this.localStream_.play('main-video');
        $('#main-video-btns').show();
        $('#mask_main').appendTo($('#player_' + this.localStream_.getId()));
      } catch (e) {
        console.error('failed to initialize local stream - ' + e);
      }
    } catch (e) {
      console.error('join room failed! ' + e);
    }
    //更新成员状态
    let states = this.client_.getRemoteMutedState();
    for (let state of states) {
      if (state.audioMuted) {
        $('#' + state.userId)
          .find('.member-audio-btn')
          .attr('src', './img/mic-off.png');
      }
      if (state.videoMuted) {
        $('#' + state.userId)
          .find('.member-video-btn')
          .attr('src', './img/camera-off.png');
        $('#mask_' + this.members_.get(state.userId).getId()).show();
      }
    }
  }

  async leave() {
    if (!this.isJoined_) {
      console.warn('leave() - please join() firstly');
      return;
    }
    // ensure the local stream is unpublished before leaving.
    await this.unpublish();

    // leave the room
    await this.client_.leave();

    this.localStream_.stop();
    this.localStream_.close();
    this.localStream_ = null;
    this.isJoined_ = false;
    resetView();
  }

  async publish() {
    if (!this.isJoined_) {
      console.warn('publish() - please join() firstly');
      return;
    }
    if (this.isPublished_) {
      console.warn('duplicate RtcClient.publish() observed');
      return;
    }
    try {
      await this.client_.publish(this.localStream_);
    } catch (e) {
      console.error('failed to publish local stream ' + e);
      this.isPublished_ = false;
    }

    this.isPublished_ = true;
  }

  async unpublish() {
    if (!this.isJoined_) {
      console.warn('unpublish() - please join() firstly');
      return;
    }
    if (!this.isPublished_) {
      console.warn('RtcClient.unpublish() called but not published yet');
      return;
    }

    await this.client_.unpublish(this.localStream_);
    this.isPublished_ = false;
  }

  muteLocalAudio() {
    this.localStream_.muteAudio();
  }

  unmuteLocalAudio() {
    this.localStream_.unmuteAudio();
  }

  muteLocalVideo() {
    this.localStream_.muteVideo();
  }

  unmuteLocalVideo() {
    this.localStream_.unmuteVideo();
  }

  resumeStreams() {
    this.localStream_.resume();
    for (let stream of this.remoteStreams_) {
      stream.resume();
    }
  }

  handleEvents() {
    this.client_.on('error', err => {
      console.error(err);
      alert(err);
      location.reload();
    });
    this.client_.on('client-banned', err => {
      console.error('client has been banned for ' + err);
      if (!isHidden()) {
        alert('您已被踢出房间');
        location.reload();
      } else {
        document.addEventListener(
          'visibilitychange',
          () => {
            if (!isHidden()) {
              alert('您已被踢出房间');
              location.reload();
            }
          },
          false
        );
      }
    });
    // fired when a remote peer is joining the room
    this.client_.on('peer-join', evt => {
      const userId = evt.userId;
      console.log('peer-join ' + userId);
      if (userId !== shareUserId) {
        addMemberView(userId);
      }
    });
    // fired when a remote peer is leaving the room
    this.client_.on('peer-leave', evt => {
      const userId = evt.userId;
      removeView(userId);
      console.log('peer-leave ' + userId);
    });
    // fired when a remote stream is added
    this.client_.on('stream-added', evt => {
      const remoteStream = evt.stream;
      const id = remoteStream.getId();
      const userId = remoteStream.getUserId();
      this.members_.set(userId, remoteStream);
      console.log(`remote stream added: [${userId}] ID: ${id} type: ${remoteStream.getType()}`);
      if (remoteStream.getUserId() === shareUserId) {
        // don't need screen shared by us
        this.client_.unsubscribe(remoteStream);
      } else {
        console.log('subscribe to this remote stream');
        this.client_.subscribe(remoteStream);
      }
    });
    // fired when a remote stream has been subscribed
    this.client_.on('stream-subscribed', evt => {
      const uid = evt.userId;
      const remoteStream = evt.stream;
      const id = remoteStream.getId();
      this.remoteStreams_.push(remoteStream);
      remoteStream.on('player-state-changed', event => {
        console.log(`${event.type} player is ${event.state}`);
        if (event.type == 'video' && event.state == 'STOPPED') {
          $('#mask_' + remoteStream.getId()).show();
          $('#' + remoteStream.getUserId())
            .find('.member-video-btn')
            .attr('src', 'img/camera-off.png');
        }
        if (event.type == 'video' && event.state == 'PLAYING') {
          $('#mask_' + remoteStream.getId()).hide();
          $('#' + remoteStream.getUserId())
            .find('.member-video-btn')
            .attr('src', 'img/camera-on.png');
        }
      });
      addVideoView(id);
      // objectFit 为播放的填充模式，详细参考：https://trtc-1252463788.file.myqcloud.com/web/docs/Stream.html#play
      remoteStream.play(id, { objectFit: 'contain' });
      //添加“摄像头未打开”遮罩
      let mask = $('#mask_main').clone();
      mask.attr('id', 'mask_' + id);
      mask.appendTo($('#player_' + id));
      mask.hide();
      if (!remoteStream.hasVideo()) {
        mask.show();
        $('#' + remoteStream.getUserId())
          .find('.member-video-btn')
          .attr('src', 'img/camera-off.png');
      }
      console.log('stream-subscribed ID: ', id);
    });
    // fired when the remote stream is removed, e.g. the remote user called Client.unpublish()
    this.client_.on('stream-removed', evt => {
      const remoteStream = evt.stream;
      const id = remoteStream.getId();
      remoteStream.stop();
      this.remoteStreams_ = this.remoteStreams_.filter(stream => {
        return stream.getId() !== id;
      });
      removeView(id);
      console.log(`stream-removed ID: ${id}  type: ${remoteStream.getType()}`);
    });

    this.client_.on('stream-updated', evt => {
      const remoteStream = evt.stream;
      let uid = this.getUidByStreamId(remoteStream.getId());
      if (!remoteStream.hasVideo()) {
        $('#' + uid)
          .find('.member-video-btn')
          .attr('src', 'img/camera-off.png');
      }
      console.log(
        'type: ' +
        remoteStream.getType() +
        ' stream-updated hasAudio: ' +
        remoteStream.hasAudio() +
        ' hasVideo: ' +
        remoteStream.hasVideo() +
        ' uid: ' +
        uid
      );
    });

    this.client_.on('mute-audio', evt => {
      console.log(evt.userId + ' mute audio');
      $('#' + evt.userId)
        .find('.member-audio-btn')
        .attr('src', 'img/mic-off.png');
    });
    this.client_.on('unmute-audio', evt => {
      console.log(evt.userId + ' unmute audio');
      $('#' + evt.userId)
        .find('.member-audio-btn')
        .attr('src', 'img/mic-on.png');
    });
    this.client_.on('mute-video', evt => {
      console.log(evt.userId + ' mute video');
      $('#' + evt.userId)
        .find('.member-video-btn')
        .attr('src', 'img/camera-off.png');
      let streamId = this.members_.get(evt.userId).getId();
      if (streamId) {
        $('#mask_' + streamId).show();
      }
    });
    this.client_.on('unmute-video', evt => {
      console.log(evt.userId + ' unmute video');
      $('#' + evt.userId)
        .find('.member-video-btn')
        .attr('src', 'img/camera-on.png');
      const stream = this.members_.get(evt.userId);
      if (stream) {
        let streamId = stream.getId();
        if (streamId) {
          $('#mask_' + streamId).hide();
        }
      }
    });
  }

  showStreamState(stream) {
    console.log('has audio: ' + stream.hasAudio() + ' has video: ' + stream.hasVideo());
  }

  getUidByStreamId(streamId) {
    for (let [uid, stream] of this.members_) {
      if (stream.getId() == streamId) {
        return uid;
      }
    }
  }
}
