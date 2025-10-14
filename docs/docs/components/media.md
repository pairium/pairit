# Media

Display images, audio, or video.

Events
- `onPlay`: emitted when media starts playing
- `onPause`: emitted when media is paused
- `onSeek`: emitted when user seeks to a different time
- `onComplete`: emitted when media reaches the end
- `onError`: emitted when media fails to load or play

Event Data
- `media_id`: identifier for the media asset
- `current_time`: current playback position (seconds)
- `duration`: total media duration (seconds)
- `error_message`: error details (onError events only)
- Custom data can be added via `events.{eventName}.data`

Example

```yaml
pages:
  - id: tutorial
    components:
      - type: media
        props:
          kind: image
          src: https://example.com/image.png
          alt: "Instruction screenshot"

pages:
  - id: video_demo
    components:
      - type: media
        id: onboarding_video
        props:
          kind: video
          src: https://example.com/demo.mp4
          alt: "Product demo"
        events:
          onPlay:
            type: "video_started"
            data:
              video_id: "onboarding"
              content_type: "tutorial"
          onComplete:
            type: "video_completed"
            data:
              video_id: "onboarding"
              completion_rate: 100
```


