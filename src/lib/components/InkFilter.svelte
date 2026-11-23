<svg width="0" height="0" aria-hidden="true" focusable="false">
  <filter id="ink" x="-5%" y="-10%" width="110%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="4" result="grain" />
    <feColorMatrix
      in="grain"
      type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.7"
      result="gaps"
    />
    <feComposite in="SourceGraphic" in2="gaps" operator="in" result="inked" />
    <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" seed="9" result="wobble" />
    <feDisplacementMap
      in="inked"
      in2="wobble"
      scale="1.6"
      xChannelSelector="R"
      yChannelSelector="G"
    />
  </filter>
</svg>

<style>
  svg {
    position: absolute;
  }
</style>
